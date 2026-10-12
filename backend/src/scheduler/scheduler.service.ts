import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Between, In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, NotificationType, PostPlatformStatus, PostStatus, ScheduledPostStatus, UsageMetric } from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { NotificationsService } from '../notifications/notifications.service';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { PostsService } from '../posts/posts.service';
import { PublishingService } from '../publishing/publishing.service';
import { UsageService } from '../subscriptions/usage.service';
import { ScheduledPostQueryDto, SchedulePostDto } from './dto/schedule.dto';
import { ScheduledPost } from './entities/scheduled-post.entity';
import { withQueueTimeout } from '../common/utils/queue';

const SCHEDULABLE: PostStatus[] = [PostStatus.DRAFT, PostStatus.SCHEDULED, PostStatus.FAILED, PostStatus.PARTIALLY_PUBLISHED, PostStatus.CANCELLED];
const REMINDER_WINDOW_MS = 30 * 60_000;

/**
 * Scheduling: a BullMQ delayed job fires at the scheduled time and fans out into
 * one publishing job per platform. `scheduled_posts` is the source of truth; a
 * once-a-minute sweep recovers schedules whose Redis job was lost.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(ScheduledPost) private readonly scheduled: Repository<ScheduledPost>,
    @InjectRepository(PostPlatform) private readonly postPlatforms: Repository<PostPlatform>,
    @InjectQueue(QUEUES.SCHEDULER) private readonly queue: Queue,
    private readonly posts: PostsService,
    private readonly publishing: PublishingService,
    private readonly access: BrandAccessService,
    private readonly usage: UsageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Not awaited: BullMQ waits for Redis, which must never block application startup.
    void this.queue
      .upsertJobScheduler('schedule-sweep', { every: 60_000 }, { name: JOBS.SCHEDULE_SWEEP, opts: { removeOnComplete: 10, removeOnFail: 50 } })
      .catch((err: unknown) => this.logger.warn(`Could not register schedule sweep: ${(err as Error).message}`));
  }

  async schedule(userId: string, postId: string, dto: SchedulePostDto) {
    const post = await this.posts.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    const when = new Date(dto.scheduledAt);
    const now = Date.now();
    if (when.getTime() < now + 60_000) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Schedule time must be at least 1 minute in the future');
    if (when.getTime() > now + 365 * 86_400_000) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Posts can be scheduled up to 1 year ahead');
    if (!SCHEDULABLE.includes(post.status)) throw new AppException(ErrorCode.POST_INVALID_STATE, `A ${post.status} post cannot be scheduled`);
    const pending = post.platforms.filter((pp) => pp.status !== PostPlatformStatus.PUBLISHED);
    if (pending.length === 0) throw new AppException(ErrorCode.POST_INVALID_STATE, 'Select at least one unpublished platform before scheduling');

    const existing = await this.scheduled.findOne({ where: { postId } });
    const isActive = existing && (existing.status === ScheduledPostStatus.PENDING || existing.status === ScheduledPostStatus.QUEUED);
    if (!isActive) {
      const { brand } = await this.access.assert(userId, post.brandId);
      await this.usage.assertWithinLimit(brand.ownerId, UsageMetric.SCHEDULED_POSTS);
    }
    if (existing?.queueJobId) await withQueueTimeout(this.queue.remove(existing.queueJobId)).catch(() => undefined);

    const row = await this.scheduled.save(
      this.scheduled.merge(existing ?? this.scheduled.create({ postId, brandId: post.brandId }), {
        scheduledAt: when,
        timezone: dto.timezone ?? post.timezone,
        status: ScheduledPostStatus.PENDING,
        createdBy: userId,
        reminderSentAt: null,
        queueJobId: null,
      }),
    );

    const jobId = `scheduled_${postId}_${when.getTime()}`;
    try {
      await withQueueTimeout(this.queue.add(
        JOBS.SCHEDULED_POST,
        { scheduledPostId: row.id, scheduledAt: when.toISOString() },
        { jobId, delay: when.getTime() - Date.now(), removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      ));
      await this.scheduled.update({ id: row.id }, { queueJobId: jobId, status: ScheduledPostStatus.QUEUED });
    } catch (err) {
      // The sweep will still pick it up once Redis is reachable.
      this.logger.warn(`Delayed job not queued (sweep will recover it): ${(err as Error).message}`);
    }

    await this.postPlatforms.update({ postId, status: Not(PostPlatformStatus.PUBLISHED) }, { status: PostPlatformStatus.PENDING, errorCode: null, errorMessage: null });
    await this.posts.setStatus(postId, PostStatus.SCHEDULED, { scheduledAt: when, ...(dto.timezone ? { timezone: dto.timezone } : {}) });
    await this.audit.log({ action: 'post.schedule', userId, brandId: post.brandId, entityType: 'post', entityId: postId, metadata: { scheduledAt: when.toISOString() } });
    return this.posts.findOne(userId, postId);
  }

  async unschedule(userId: string, postId: string) {
    const post = await this.posts.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    const row = await this.scheduled.findOne({ where: { postId } });
    if (!row || ![ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED].includes(row.status)) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, 'This post is not scheduled');
    }
    if (row.queueJobId) await withQueueTimeout(this.queue.remove(row.queueJobId)).catch(() => undefined);
    await this.scheduled.update({ id: row.id }, { status: ScheduledPostStatus.CANCELLED });
    await this.posts.setStatus(postId, PostStatus.DRAFT, { scheduledAt: null });
    await this.audit.log({ action: 'post.unschedule', userId, brandId: post.brandId, entityType: 'post', entityId: postId });
    return this.posts.findOne(userId, postId);
  }

  async list(userId: string, query: ScheduledPostQueryDto) {
    const brandIds = query.brandId ? [query.brandId] : await this.access.accessibleBrandIds(userId);
    if (query.brandId) await this.access.assert(userId, query.brandId);
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date(Date.now() + 5 * 365 * 86_400_000);
    const [rows, total] = await this.scheduled.findAndCount({
      where: {
        brandId: In(brandIds),
        scheduledAt: Between(from, to),
        status: query.status ?? In([ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED]),
      },
      order: { scheduledAt: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        status: r.status,
        scheduledAt: r.scheduledAt,
        timezone: r.timezone,
        post: await this.posts.toResponse(await this.posts.loadFull(r.postId)).catch(() => null),
      })),
    );
    return new PaginatedResult(items.filter((i) => i.post), total, query.page, query.limit);
  }

  /** Fired by the delayed job (or the sweep): fans out into per-platform publishing jobs. */
  async trigger(scheduledPostId: string, expectedAt?: string): Promise<void> {
    const row = await this.scheduled.findOne({ where: { id: scheduledPostId } });
    if (!row) return;
    if (expectedAt && row.scheduledAt.getTime() !== new Date(expectedAt).getTime()) return; // rescheduled - stale job

    // Atomic claim so the delayed job and the sweep can never both publish.
    const claim = await this.scheduled.update(
      { id: row.id, status: In([ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED]) },
      { status: ScheduledPostStatus.PROCESSING },
    );
    if (!claim.affected) return;

    try {
      const post = await this.posts.loadFull(row.postId);
      const targets = post.platforms.filter((pp) => pp.status !== PostPlatformStatus.PUBLISHED);
      this.logger.log({ postId: post.id, platforms: targets.length }, 'Scheduled post triggered');
      await this.publishing.startBatch(post, targets, row.createdBy, { scheduledFor: row.scheduledAt });
      await this.scheduled.update({ id: row.id }, { status: ScheduledPostStatus.COMPLETED });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error({ err: message, scheduledPostId }, 'Scheduled publish could not start');
      await this.scheduled.update({ id: row.id }, { status: ScheduledPostStatus.CANCELLED });
      await this.posts.setStatus(row.postId, PostStatus.FAILED).catch(() => undefined);
      if (row.createdBy) {
        await this.notifications.notify({
          userId: row.createdBy,
          brandId: row.brandId,
          type: NotificationType.PUBLISH_FAILED,
          title: 'Scheduled post could not be published',
          body: message.slice(0, 500),
          data: { postId: row.postId },
        });
      }
    }
  }

  /** Runs every minute: recover missed schedules and send reminders. */
  async sweep(): Promise<void> {
    const overdue = await this.scheduled.find({
      where: { status: In([ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED]), scheduledAt: LessThan(new Date(Date.now() - 2 * 60_000)) },
      take: 50,
    });
    for (const row of overdue) {
      this.logger.warn({ scheduledPostId: row.id }, 'Recovering overdue scheduled post');
      await this.trigger(row.id);
    }

    const upcoming = await this.scheduled.find({
      where: {
        status: In([ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED]),
        scheduledAt: Between(new Date(), new Date(Date.now() + REMINDER_WINDOW_MS)),
        reminderSentAt: IsNull(),
      },
      take: 100,
    });
    for (const row of upcoming) {
      if (row.createdBy) {
        const minutes = Math.max(1, Math.round((row.scheduledAt.getTime() - Date.now()) / 60_000));
        await this.notifications.notify({
          userId: row.createdBy,
          brandId: row.brandId,
          type: NotificationType.SCHEDULED_REMINDER,
          title: `Scheduled post goes live in ${minutes} min`,
          data: { postId: row.postId, scheduledAt: row.scheduledAt.toISOString() },
        });
      }
      await this.scheduled.update({ id: row.id }, { reminderSentAt: new Date() });
    }
  }
}
