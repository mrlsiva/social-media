import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiTextService } from '../ai/ai-text.service';
import { CampaignPlanBriefDto } from '../ai/dto/ai.dto';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { BrandSetting } from '../brands/entities/brand-setting.entity';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, CampaignStatus, ContentType, PostStatus, SocialAccountStatus, SocialPlatform } from '../common/enums';
import { addDays, zonedDateTimeToUtc } from '../common/utils/timezone';
import { PostsService } from '../posts/posts.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { CampaignQueryDto, CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { Campaign } from './entities/campaign.entity';
import { CampaignPost } from './entities/campaign-post.entity';

const VIDEO_ONLY = new Set<SocialPlatform>([SocialPlatform.YOUTUBE]);

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignPost) private readonly campaignPosts: Repository<CampaignPost>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    @InjectRepository(BrandSetting) private readonly brandSettings: Repository<BrandSetting>,
    private readonly access: BrandAccessService,
    private readonly posts: PostsService,
    private readonly scheduler: SchedulerService,
    private readonly aiText: AiTextService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: CampaignQueryDto) {
    const brandIds = query.brandId ? [query.brandId] : await this.access.accessibleBrandIds(userId);
    if (query.brandId) await this.access.assert(userId, query.brandId);
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);
    const qb = this.campaigns
      .createQueryBuilder('c')
      .where('c.brand_id IN (:...brandIds)', { brandIds })
      .orderBy('c.start_date', query.order)
      .skip(query.skip)
      .take(query.limit);
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.search) qb.andWhere('c.name LIKE :s', { s: `%${query.search}%` });
    const [items, total] = await qb.getManyAndCount();
    const counts = items.length
      ? await this.campaignPosts
          .createQueryBuilder('cp')
          .select('cp.campaign_id', 'campaignId')
          .addSelect('COUNT(*)', 'count')
          .where('cp.campaign_id IN (:...ids)', { ids: items.map((c) => c.id) })
          .groupBy('cp.campaign_id')
          .getRawMany<{ campaignId: string; count: string }>()
      : [];
    const countMap = new Map(counts.map((c) => [c.campaignId, Number(c.count)]));
    return new PaginatedResult(
      items.map((c) => ({ ...c, postCount: countMap.get(c.id) ?? 0 })),
      total,
      query.page,
      query.limit,
    );
  }

  async get(userId: string, id: string) {
    const campaign = await this.getAccessible(userId, id);
    const links = await this.campaignPosts.find({ where: { campaignId: id }, order: { dayNumber: 'ASC' } });
    const posts = [];
    for (const link of links) {
      try {
        posts.push({ dayNumber: link.dayNumber, theme: link.theme, post: await this.posts.toResponse(await this.posts.loadFull(link.postId)) });
      } catch {
        /* post deleted */
      }
    }
    return { ...campaign, posts };
  }

  async create(userId: string, dto: CreateCampaignDto) {
    await this.access.assert(userId, dto.brandId, BrandRole.EDITOR);
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        brandId: dto.brandId,
        createdBy: userId,
        name: dto.name,
        description: dto.description ?? null,
        objective: dto.objective ?? null,
        startDate: dto.startDate,
        endDate: addDays(dto.startDate, dto.durationDays - 1),
        durationDays: dto.durationDays,
        platforms: dto.platforms,
        status: CampaignStatus.DRAFT,
      }),
    );
    await this.audit.log({ action: 'campaign.create', userId, brandId: dto.brandId, entityType: 'campaign', entityId: campaign.id });
    return this.get(userId, campaign.id);
  }

  async update(userId: string, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.getAccessible(userId, id, BrandRole.EDITOR);
    const startDate = dto.startDate ?? campaign.startDate;
    const durationDays = dto.durationDays ?? campaign.durationDays;
    await this.campaigns.save({
      ...campaign,
      ...dto,
      startDate,
      durationDays,
      endDate: addDays(startDate, durationDays - 1),
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const campaign = await this.getAccessible(userId, id, BrandRole.EDITOR);
    await this.campaigns.softDelete({ id });
    await this.audit.log({ action: 'campaign.delete', userId, brandId: campaign.brandId, entityType: 'campaign', entityId: id });
  }

  /**
   * AI generates a day-by-day plan and creates one editable DRAFT post per day
   * (nothing is published until the user schedules/publishes).
   */
  async generate(userId: string, id: string, brief: CampaignPlanBriefDto) {
    const campaign = await this.getAccessible(userId, id, BrandRole.EDITOR);
    const settings = await this.brandSettings.findOne({ where: { brandId: campaign.brandId } });

    const { result: plan, generationId } = await this.aiText.campaignPlan(
      userId,
      campaign.brandId,
      { ...brief, brandId: campaign.brandId, objective: brief.objective ?? campaign.objective ?? undefined, topic: brief.topic ?? campaign.name },
      campaign.durationDays,
      campaign.platforms,
    );

    // Replace previous AI drafts that were never scheduled/published.
    const previous = await this.campaignPosts.find({ where: { campaignId: id } });
    for (const link of previous) {
      try {
        const post = await this.posts.loadFull(link.postId);
        if (post.status === PostStatus.DRAFT) {
          await this.posts.remove(userId, post.id);
          await this.campaignPosts.delete({ id: link.id });
        }
      } catch {
        await this.campaignPosts.delete({ id: link.id });
      }
    }

    const accounts = await this.accounts.find({
      where: { brandId: campaign.brandId, platform: In(campaign.platforms), status: SocialAccountStatus.CONNECTED },
    });
    const timezone = settings?.timezone ?? 'UTC';
    const time = brief.postingTime ?? '10:00';

    for (const day of plan.days) {
      const date = addDays(campaign.startDate, day.day - 1);
      const isVideo = day.contentType === ContentType.VIDEO || day.contentType === ContentType.REEL;
      const dayAccounts = accounts.filter((a) => isVideo || !VIDEO_ONLY.has(a.platform));
      const created = await this.posts.create(userId, {
        brandId: campaign.brandId,
        campaignId: campaign.id,
        contentType: day.contentType,
        title: `${campaign.name} - Day ${day.day}: ${day.title || day.theme}`.slice(0, 255),
        caption: day.caption,
        hashtags: day.hashtags,
        timezone,
        platforms: dayAccounts.map((a) => ({
          socialAccountId: a.id,
          captionOverride: day.platformCaptions?.[a.platform] || undefined,
        })),
      });
      // Planned date shows on the calendar; it is only published once scheduled.
      await this.posts.setStatus(created.id, PostStatus.DRAFT, { scheduledAt: zonedDateTimeToUtc(date, time, timezone) });
      await this.campaignPosts.save(this.campaignPosts.create({ campaignId: id, postId: created.id, dayNumber: day.day, theme: day.theme?.slice(0, 191) ?? null }));
    }

    await this.campaigns.save({ ...campaign, aiPlan: { generationId, postingTime: time, timezone, days: plan.days } });
    return this.get(userId, id);
  }

  /** Schedules every draft post of the campaign at its planned time. Reports per-post results. */
  async scheduleAll(userId: string, id: string) {
    const campaign = await this.getAccessible(userId, id, BrandRole.EDITOR);
    const links = await this.campaignPosts.find({ where: { campaignId: id }, order: { dayNumber: 'ASC' } });
    const results: { postId: string; dayNumber: number; scheduled: boolean; error?: string }[] = [];
    for (const link of links) {
      try {
        const post = await this.posts.loadFull(link.postId);
        if (post.status !== PostStatus.DRAFT) {
          results.push({ postId: post.id, dayNumber: link.dayNumber, scheduled: false, error: `Post is ${post.status}` });
          continue;
        }
        if (!post.scheduledAt) throw new Error('No planned date');
        await this.scheduler.schedule(userId, post.id, { scheduledAt: post.scheduledAt.toISOString(), timezone: post.timezone });
        results.push({ postId: post.id, dayNumber: link.dayNumber, scheduled: true });
      } catch (err) {
        results.push({ postId: link.postId, dayNumber: link.dayNumber, scheduled: false, error: (err as Error).message });
      }
    }
    if (results.some((r) => r.scheduled)) await this.campaigns.update({ id: campaign.id }, { status: CampaignStatus.ACTIVE });
    return { campaignId: id, results };
  }

  private async getAccessible(userId: string, id: string, minRole: BrandRole = BrandRole.VIEWER): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw AppException.notFound(ErrorCode.CAMPAIGN_NOT_FOUND, 'Campaign not found');
    await this.access.assert(userId, campaign.brandId, minRole).catch((err: unknown) => {
      if (err instanceof AppException && err.code === ErrorCode.BRAND_ACCESS_DENIED) throw err;
      throw AppException.notFound(ErrorCode.CAMPAIGN_NOT_FOUND, 'Campaign not found');
    });
    return campaign;
  }
}
