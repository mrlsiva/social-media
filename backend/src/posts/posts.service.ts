import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, ContentType, MediaType, PostPlatformStatus, PostStatus, ScheduledPostStatus } from '../common/enums';
import { Media } from '../media/entities/media.entity';
import { MediaService } from '../media/media.service';
import { Reel } from '../reels/entities/reel.entity';
import { ReelMedia } from '../reels/entities/reel-media.entity';
import { ScheduledPost } from '../scheduler/entities/scheduled-post.entity';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import {
  CalendarQueryDto,
  CreatePostDto,
  PostPlatformInputDto,
  PostQueryDto,
  PostResponseDto,
  ReelInputDto,
  UpdatePostDto,
} from './dto/post.dto';
import { Post } from './entities/post.entity';
import { PostMedia } from './entities/post-media.entity';
import { PostPlatform } from './entities/post-platform.entity';
import { HashtagsService } from './hashtags.service';
import { toPostResponse } from './post.mapper';

/** Statuses in which the content of a post can still be edited. */
const EDITABLE: PostStatus[] = [PostStatus.DRAFT, PostStatus.SCHEDULED, PostStatus.FAILED, PostStatus.PARTIALLY_PUBLISHED, PostStatus.CANCELLED];

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(PostPlatform) private readonly postPlatforms: Repository<PostPlatform>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    private readonly access: BrandAccessService,
    private readonly media: MediaService,
    private readonly hashtags: HashtagsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- queries

  async list(userId: string, query: PostQueryDto): Promise<PaginatedResult<PostResponseDto>> {
    const brandIds = await this.resolveBrandScope(userId, query.brandId);
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);

    const qb = this.posts
      .createQueryBuilder('p')
      .where('p.brand_id IN (:...brandIds)', { brandIds })
      .orderBy('COALESCE(p.scheduled_at, p.published_at, p.created_at)', query.order)
      .skip(query.skip)
      .take(query.limit);

    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.contentType) qb.andWhere('p.content_type = :ct', { ct: query.contentType });
    if (query.campaignId) qb.andWhere('p.campaign_id = :cid', { cid: query.campaignId });
    if (query.search) {
      qb.andWhere(new Brackets((w) => w.where('p.title LIKE :s', { s: `%${query.search}%` }).orWhere('p.caption LIKE :s')));
    }
    if (query.platform) {
      qb.andWhere('EXISTS (SELECT 1 FROM post_platforms pp WHERE pp.post_id = p.id AND pp.platform = :platform)', {
        platform: query.platform,
      });
    }
    if (query.from) qb.andWhere('COALESCE(p.scheduled_at, p.published_at, p.created_at) >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('COALESCE(p.scheduled_at, p.published_at, p.created_at) <= :to', { to: new Date(query.to) });

    const [rows, total] = await qb.getManyAndCount();
    const full = await this.loadMany(rows.map((r) => r.id));
    return new PaginatedResult(full.map((p) => toPostResponse(p)), total, query.page, query.limit);
  }

  /** Lightweight events for the content calendar (max 93 day window). */
  async calendar(userId: string, query: CalendarQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Calendar range must be positive and at most 93 days');
    }
    const brandIds = await this.resolveBrandScope(userId, query.brandId);
    if (brandIds.length === 0) return [];

    const rows = await this.posts
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.platforms', 'pp')
      .leftJoinAndSelect('p.media', 'pm')
      .leftJoinAndSelect('pm.media', 'm')
      .where('p.brand_id IN (:...brandIds)', { brandIds })
      .andWhere('COALESCE(p.scheduled_at, p.published_at, p.created_at) BETWEEN :from AND :to', { from, to })
      .orderBy('COALESCE(p.scheduled_at, p.published_at, p.created_at)', 'ASC')
      .getMany();

    return rows.map((p) => {
      const firstMedia = [...(p.media ?? [])].sort((a, b) => a.position - b.position)[0]?.media;
      return {
        id: p.id,
        brandId: p.brandId,
        title: p.title ?? p.caption?.slice(0, 60) ?? 'Untitled post',
        contentType: p.contentType,
        status: p.status,
        date: p.scheduledAt ?? p.publishedAt ?? p.createdAt,
        scheduledAt: p.scheduledAt,
        publishedAt: p.publishedAt,
        platforms: (p.platforms ?? []).map((pp) => ({ platform: pp.platform, status: pp.status })),
        thumbnailUrl: firstMedia?.type === MediaType.IMAGE ? firstMedia.url : null,
      };
    });
  }

  async findOne(userId: string, postId: string): Promise<PostResponseDto> {
    const post = await this.getAccessiblePost(userId, postId);
    return this.toResponse(post);
  }

  /** Loads a post with all relations after verifying brand membership. */
  async getAccessiblePost(userId: string, postId: string, minRole: BrandRole = BrandRole.VIEWER): Promise<Post> {
    const post = await this.posts.findOne({ where: { id: postId }, select: { id: true, brandId: true } });
    if (!post) throw AppException.notFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    try {
      await this.access.assert(userId, post.brandId, minRole);
    } catch (err) {
      if (err instanceof AppException && err.code === ErrorCode.BRAND_ACCESS_DENIED) throw err;
      throw AppException.notFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    return this.loadFull(postId);
  }

  async loadFull(postId: string): Promise<Post> {
    const [post] = await this.loadMany([postId]);
    if (!post) throw AppException.notFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    return post;
  }

  async toResponse(post: Post): Promise<PostResponseDto> {
    const thumbnail = post.thumbnailMediaId ? await this.media.findByIdUnsafe(post.thumbnailMediaId) : null;
    return toPostResponse(post, thumbnail);
  }

  // ---------------------------------------------------------------- commands

  async create(userId: string, dto: CreatePostDto): Promise<PostResponseDto> {
    await this.access.assert(userId, dto.brandId, BrandRole.EDITOR);
    const mediaItems = await this.validateMedia(dto.brandId, dto.contentType, dto.mediaIds ?? [], dto.thumbnailMediaId);
    const accounts = await this.validateAccounts(dto.brandId, dto.platforms ?? []);

    const postId = await this.posts.manager.transaction(async (em) => {
      const post = await em.save(
        em.create(Post, {
          brandId: dto.brandId,
          campaignId: dto.campaignId ?? null,
          createdBy: userId,
          title: dto.title ?? null,
          contentType: dto.contentType,
          caption: dto.caption ?? null,
          hashtags: dto.hashtags ?? null,
          mentions: dto.mentions ?? null,
          cta: dto.cta ?? null,
          linkUrl: dto.linkUrl ?? null,
          videoTitle: dto.videoTitle ?? null,
          videoDescription: dto.videoDescription ?? null,
          thumbnailMediaId: dto.thumbnailMediaId ?? null,
          status: PostStatus.DRAFT,
          timezone: dto.timezone ?? 'UTC',
        }),
      );
      await this.replaceMedia(em, post.id, mediaItems);
      await this.syncPlatforms(em, post.id, dto.platforms ?? [], accounts);
      if (dto.contentType === ContentType.REEL) await this.upsertReel(em, post.id, dto.reel ?? {}, mediaItems);
      return post.id;
    });

    if (dto.hashtags?.length) await this.hashtags.recordUsage(dto.brandId, dto.hashtags);
    await this.audit.log({ action: 'post.create', userId, brandId: dto.brandId, entityType: 'post', entityId: postId });
    return this.toResponse(await this.loadFull(postId));
  }

  async update(userId: string, postId: string, dto: UpdatePostDto): Promise<PostResponseDto> {
    const post = await this.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    if (!EDITABLE.includes(post.status)) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, `A post that is ${post.status} cannot be edited`);
    }
    const contentType = dto.contentType ?? post.contentType;
    const mediaIds = dto.mediaIds ?? post.media.sort((a, b) => a.position - b.position).map((pm) => pm.mediaId);
    const thumbnailId = dto.thumbnailMediaId !== undefined ? dto.thumbnailMediaId : post.thumbnailMediaId ?? undefined;
    const mediaItems = await this.validateMedia(post.brandId, contentType, mediaIds, thumbnailId);
    const accounts = dto.platforms ? await this.validateAccounts(post.brandId, dto.platforms) : null;

    await this.posts.manager.transaction(async (em) => {
      const { platforms, mediaIds: _m, reel, ...fields } = dto;
      if (Object.keys(fields).length > 0) await em.save(Post, { ...fields, id: postId });
      if (dto.mediaIds) await this.replaceMedia(em, postId, mediaItems);
      if (platforms && accounts) await this.syncPlatforms(em, postId, platforms, accounts);
      if (contentType === ContentType.REEL && (reel || dto.mediaIds)) await this.upsertReel(em, postId, reel ?? {}, mediaItems);
    });

    if (dto.hashtags?.length) await this.hashtags.recordUsage(post.brandId, dto.hashtags);
    await this.audit.log({ action: 'post.update', userId, brandId: post.brandId, entityType: 'post', entityId: postId });
    return this.toResponse(await this.loadFull(postId));
  }

  async duplicate(userId: string, postId: string): Promise<PostResponseDto> {
    const post = await this.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    return this.create(userId, {
      brandId: post.brandId,
      contentType: post.contentType,
      title: post.title ? `${post.title} (copy)`.slice(0, 255) : undefined,
      caption: post.caption ?? undefined,
      hashtags: post.hashtags ?? undefined,
      mentions: post.mentions ?? undefined,
      cta: post.cta ?? undefined,
      linkUrl: post.linkUrl ?? undefined,
      videoTitle: post.videoTitle ?? undefined,
      videoDescription: post.videoDescription ?? undefined,
      thumbnailMediaId: post.thumbnailMediaId ?? undefined,
      mediaIds: post.media.sort((a, b) => a.position - b.position).map((pm) => pm.mediaId),
      platforms: post.platforms.map((pp) => ({
        socialAccountId: pp.socialAccountId,
        captionOverride: pp.captionOverride ?? undefined,
        hashtagsOverride: pp.hashtagsOverride ?? undefined,
        titleOverride: pp.titleOverride ?? undefined,
        options: pp.options ?? undefined,
      })),
      reel: post.reel
        ? {
            script: post.reel.script ?? undefined,
            textOverlays: post.reel.textOverlays ?? undefined,
            voiceOverEnabled: post.reel.voiceOverEnabled,
            voiceOverText: post.reel.voiceOverText ?? undefined,
            voice: post.reel.voice ?? undefined,
            subtitlesEnabled: post.reel.subtitlesEnabled,
            subtitlesSrt: post.reel.subtitlesSrt ?? undefined,
            musicPreference: post.reel.musicPreference ?? undefined,
            durationSeconds: post.reel.durationSeconds ?? undefined,
          }
        : undefined,
      campaignId: post.campaignId ?? undefined,
      timezone: post.timezone,
    });
  }

  /** Soft-deletes a post. A pending schedule is cancelled (the queued job becomes a no-op). */
  async remove(userId: string, postId: string): Promise<void> {
    const post = await this.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    if (post.status === PostStatus.PUBLISHING) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, 'This post is being published right now. Try again in a moment.');
    }
    await this.posts.manager.transaction(async (em) => {
      await em.update(
        ScheduledPost,
        { postId, status: In([ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED]) },
        { status: ScheduledPostStatus.CANCELLED },
      );
      await em.softDelete(Post, { id: postId });
    });
    await this.audit.log({ action: 'post.delete', userId, brandId: post.brandId, entityType: 'post', entityId: postId });
  }

  // ---------------------------------------------------------------- status helpers (used by publishing)

  async setStatus(postId: string, status: PostStatus, extra: Partial<Pick<Post, 'scheduledAt' | 'publishedAt' | 'timezone'>> = {}): Promise<void> {
    await this.posts.update({ id: postId }, { status, ...extra });
  }

  /** Derives the overall post status from its platform statuses. */
  async recomputeStatus(postId: string): Promise<PostStatus> {
    const platforms = await this.postPlatforms.find({ where: { postId } });
    const statuses = platforms.map((p) => p.status);
    let status: PostStatus;
    if (statuses.some((s) => s === PostPlatformStatus.QUEUED || s === PostPlatformStatus.PUBLISHING)) status = PostStatus.PUBLISHING;
    else if (statuses.length > 0 && statuses.every((s) => s === PostPlatformStatus.PUBLISHED)) status = PostStatus.PUBLISHED;
    else if (statuses.some((s) => s === PostPlatformStatus.PUBLISHED)) status = PostStatus.PARTIALLY_PUBLISHED;
    else if (statuses.some((s) => s === PostPlatformStatus.FAILED)) status = PostStatus.FAILED;
    else {
      const current = await this.posts.findOne({ where: { id: postId }, select: { id: true, status: true } });
      status = current?.status === PostStatus.SCHEDULED ? PostStatus.SCHEDULED : PostStatus.DRAFT;
    }
    const publishedAt = platforms
      .map((p) => p.publishedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    await this.posts.update({ id: postId }, { status, ...(publishedAt ? { publishedAt } : {}) });
    return status;
  }

  // ---------------------------------------------------------------- internals

  private async loadMany(ids: string[]): Promise<Post[]> {
    if (ids.length === 0) return [];
    const rows = await this.posts.find({
      where: { id: In(ids) },
      relations: { media: { media: true }, platforms: { socialAccount: true }, reel: true },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private async resolveBrandScope(userId: string, brandId?: string): Promise<string[]> {
    if (brandId) {
      await this.access.assert(userId, brandId);
      return [brandId];
    }
    return this.access.accessibleBrandIds(userId);
  }

  /** Structural media rules per content type (platform-specific rules are enforced by publishers). */
  private async validateMedia(brandId: string, contentType: ContentType, mediaIds: string[], thumbnailId?: string | null): Promise<Media[]> {
    const items = await this.media.getManyForBrand(brandId, mediaIds);
    const images = items.filter((m) => m.mimeType.startsWith('image/'));
    const videos = items.filter((m) => m.mimeType.startsWith('video/'));
    const fail = (message: string) => {
      throw new AppException(ErrorCode.VALIDATION_FAILED, message);
    };

    switch (contentType) {
      case ContentType.IMAGE:
        if (videos.length > 0 || images.length > 1) fail('An image post takes a single image. Use "carousel" for multiple items.');
        break;
      case ContentType.CAROUSEL:
        if (items.length > 10) fail('A carousel can contain at most 10 items');
        break;
      case ContentType.VIDEO:
      case ContentType.REEL:
        if (images.length > 0 || videos.length > 1) fail(`A ${contentType} post takes exactly one video`);
        break;
    }

    if (thumbnailId) {
      const [thumb] = await this.media.getManyForBrand(brandId, [thumbnailId]);
      if (!thumb.mimeType.startsWith('image/')) fail('Thumbnail must be an image');
    }
    return items;
  }

  private async validateAccounts(brandId: string, platforms: PostPlatformInputDto[]): Promise<Map<string, SocialAccount>> {
    const ids = platforms.map((p) => p.socialAccountId);
    if (new Set(ids).size !== ids.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Each social account can only be selected once');
    }
    if (ids.length === 0) return new Map();
    const accounts = await this.accounts.find({ where: { id: In(ids), brandId } });
    if (accounts.length !== ids.length) {
      throw new AppException(ErrorCode.SOCIAL_ACCOUNT_NOT_CONNECTED, 'One or more social accounts are not connected to this brand');
    }
    return new Map(accounts.map((a) => [a.id, a]));
  }

  private async replaceMedia(em: EntityManager, postId: string, items: Media[]): Promise<void> {
    await em.delete(PostMedia, { postId });
    if (items.length === 0) return;
    await em.save(items.map((m, position) => em.create(PostMedia, { postId, mediaId: m.id, position })));
  }

  /**
   * Upserts the post's destinations. Platforms already published are kept untouched
   * (we never silently drop the record of a live post).
   */
  private async syncPlatforms(em: EntityManager, postId: string, inputs: PostPlatformInputDto[], accounts: Map<string, SocialAccount>): Promise<void> {
    const existing = await em.find(PostPlatform, { where: { postId } });
    const keep = new Set(inputs.map((i) => i.socialAccountId));
    const removable = existing.filter((e) => !keep.has(e.socialAccountId) && e.status !== PostPlatformStatus.PUBLISHED);
    if (removable.length) await em.delete(PostPlatform, { id: In(removable.map((r) => r.id)) });

    for (const input of inputs) {
      const account = accounts.get(input.socialAccountId)!;
      const current = existing.find((e) => e.socialAccountId === input.socialAccountId);
      const patch = {
        captionOverride: input.captionOverride ?? null,
        hashtagsOverride: input.hashtagsOverride ?? null,
        titleOverride: input.titleOverride ?? null,
        options: input.options ? { ...input.options } : null,
      };
      if (current) {
        if (current.status === PostPlatformStatus.PUBLISHED) continue;
        await em.save(PostPlatform, { ...current, ...patch });
      } else {
        await em.save(em.create(PostPlatform, { postId, socialAccountId: account.id, platform: account.platform, status: PostPlatformStatus.PENDING, ...patch }));
      }
    }
  }

  private async upsertReel(em: EntityManager, postId: string, input: ReelInputDto, mediaItems: Media[]): Promise<void> {
    const existing = await em.findOne(Reel, { where: { postId } });
    const patch: Partial<Reel> = {};
    if (input.script !== undefined) patch.script = { ...input.script };
    if (input.textOverlays !== undefined) patch.textOverlays = input.textOverlays.map((o) => ({ ...o }));
    if (input.voiceOverEnabled !== undefined) patch.voiceOverEnabled = input.voiceOverEnabled;
    if (input.voiceOverText !== undefined) patch.voiceOverText = input.voiceOverText;
    if (input.voice !== undefined) patch.voice = input.voice;
    if (input.subtitlesEnabled !== undefined) patch.subtitlesEnabled = input.subtitlesEnabled;
    if (input.subtitlesSrt !== undefined) patch.subtitlesSrt = input.subtitlesSrt;
    if (input.musicPreference !== undefined) patch.musicPreference = input.musicPreference;
    if (input.durationSeconds !== undefined) patch.durationSeconds = input.durationSeconds;
    const reel: Reel = await em.save(Reel, existing ? em.merge(Reel, existing, patch) : em.create(Reel, { postId, ...patch }));

    // Keep the reel's final video in reel_media in sync with the post media.
    await em.delete(ReelMedia, { reelId: reel.id, role: 'final' });
    const video = mediaItems.find((m) => m.mimeType.startsWith('video/'));
    if (video) await em.save(em.create(ReelMedia, { reelId: reel.id, mediaId: video.id, role: 'final', position: 0 }));
  }
}
