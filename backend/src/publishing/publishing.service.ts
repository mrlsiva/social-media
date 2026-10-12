import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException, ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  BrandRole,
  ContentType,
  NotificationType,
  PostPlatformStatus,
  PostStatus,
  PublishingJobStatus,
  SocialAccountStatus,
} from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { Media } from '../media/entities/media.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Post } from '../posts/entities/post.entity';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { PostsService } from '../posts/posts.service';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { TokenService } from '../social-accounts/token.service';
import { PLATFORM_NAMES } from './base.publisher';
import { composeContent } from './content-composer';
import { PlatformStatusDto, PublishBatchResponseDto, PublishingJobQueryDto, PublishNowDto } from './dto/publishing.dto';
import { PublishingJob } from './entities/publishing-job.entity';
import { PublishingLog } from './entities/publishing-log.entity';
import { OAuthCredentials, PublishContext } from './interfaces/social-publisher.interface';
import { PublishMediaFactory } from './publish-media.factory';
import { PublisherRegistry } from './publisher.registry';
import { withQueueTimeout } from '../common/utils/queue';

export const PUBLISH_JOB_ATTEMPTS = 3;

interface Failure {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * One-click multi-platform publishing.
 * A publish request creates one `publishing_jobs` row + one BullMQ job per platform
 * (sharing a batch id). Each platform succeeds or fails independently; failed
 * platforms can be retried individually.
 */
@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    @InjectRepository(PublishingJob) private readonly jobs: Repository<PublishingJob>,
    @InjectRepository(PublishingLog) private readonly logs: Repository<PublishingLog>,
    @InjectRepository(PostPlatform) private readonly postPlatforms: Repository<PostPlatform>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    @InjectQueue(QUEUES.PUBLISHING) private readonly queue: Queue,
    private readonly posts: PostsService,
    private readonly tokens: TokenService,
    private readonly registry: PublisherRegistry,
    private readonly mediaFactory: PublishMediaFactory,
    private readonly notifications: NotificationsService,
    private readonly access: BrandAccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- API commands

  /** "Publish Now" to selected platforms (or every unpublished one when no targets are given). */
  async publishNow(userId: string, postId: string, dto: PublishNowDto): Promise<PublishBatchResponseDto> {
    const post = await this.posts.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    this.assertPublishable(post);
    let targets = post.platforms.filter((pp) => pp.status !== PostPlatformStatus.PUBLISHED);
    if (dto.targets?.length) {
      const wanted = new Set(dto.targets);
      targets = post.platforms.filter((pp) => wanted.has(pp.id) || wanted.has(pp.socialAccountId));
      if (targets.length !== dto.targets.length) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, 'One or more selected platforms are not part of this post');
      }
    }
    return this.startBatch(post, targets, userId);
  }

  /** "Publish to All": every selected platform of the post that is not yet published. */
  async publishAll(userId: string, postId: string): Promise<PublishBatchResponseDto> {
    const post = await this.posts.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    this.assertPublishable(post);
    return this.startBatch(post, post.platforms.filter((pp) => pp.status !== PostPlatformStatus.PUBLISHED), userId);
  }

  /** Retries only the platforms whose last attempt failed. */
  async retryFailed(userId: string, postId: string): Promise<PublishBatchResponseDto> {
    const post = await this.posts.getAccessiblePost(userId, postId, BrandRole.EDITOR);
    const failed = post.platforms.filter((pp) => pp.status === PostPlatformStatus.FAILED);
    if (failed.length === 0) throw new AppException(ErrorCode.POST_INVALID_STATE, 'There are no failed platforms to retry');
    return this.startBatch(post, failed, userId);
  }

  /** Retries one failed publishing job (POST /publishing/:jobId/retry). */
  async retryJob(userId: string, jobId: string): Promise<PublishBatchResponseDto> {
    const job = await this.getJobForUser(userId, jobId, BrandRole.EDITOR);
    if (job.status !== PublishingJobStatus.FAILED) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, `Only failed jobs can be retried (current: ${job.status})`);
    }
    const post = await this.posts.loadFull(job.postId);
    const pp = post.platforms.find((p) => p.id === job.postPlatformId);
    if (!pp) throw AppException.notFound(ErrorCode.PUBLISH_JOB_NOT_FOUND, 'The platform for this job no longer exists');
    if (pp.status === PostPlatformStatus.PUBLISHED) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, 'This platform has already been published successfully');
    }
    return this.startBatch(post, [pp], userId, { retryOfJobId: job.id });
  }

  /**
   * Creates the per-platform jobs. Platforms that cannot be published (disconnected account,
   * unsupported/invalid content) are recorded as failed immediately - the rest are queued.
   */
  async startBatch(post: Post, targets: PostPlatform[], triggeredBy: string | null, opts: { retryOfJobId?: string; scheduledFor?: Date } = {}): Promise<PublishBatchResponseDto> {
    if (targets.length === 0) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, 'Select at least one platform that has not been published yet');
    }
    const busy = targets.filter((t) => t.status === PostPlatformStatus.QUEUED || t.status === PostPlatformStatus.PUBLISHING);
    if (busy.length) {
      throw new AppException(ErrorCode.POST_INVALID_STATE, `Already publishing to: ${busy.map((b) => PLATFORM_NAMES[b.platform]).join(', ')}`, HttpStatus.CONFLICT);
    }

    const batchId = randomUUID();
    const response: PublishBatchResponseDto = { batchId, postId: post.id, jobs: [], skipped: [] };
    const accounts = await this.accounts.find({ where: { id: In(targets.map((t) => t.socialAccountId)) }, withDeleted: true });

    for (const pp of targets) {
      const account = accounts.find((a) => a.id === pp.socialAccountId);
      const job = await this.jobs.save(
        this.jobs.create({
          batchId,
          brandId: post.brandId,
          postId: post.id,
          postPlatformId: pp.id,
          socialAccountId: pp.socialAccountId,
          platform: pp.platform,
          status: PublishingJobStatus.PENDING,
          maxAttempts: PUBLISH_JOB_ATTEMPTS,
          triggeredBy,
          retryOfJobId: opts.retryOfJobId ?? null,
          scheduledFor: opts.scheduledFor ?? null,
        }),
      );

      const precheck = this.precheck(post, pp, account);
      if (precheck) {
        await this.failJob(job, pp, precheck);
        response.skipped.push({ postPlatformId: pp.id, platform: pp.platform, reason: precheck.message, errorCode: precheck.code });
        response.jobs.push({ jobId: job.id, postPlatformId: pp.id, platform: pp.platform, accountName: account?.accountName ?? '', status: PublishingJobStatus.FAILED });
        continue;
      }

      await this.postPlatforms.update({ id: pp.id }, { status: PostPlatformStatus.QUEUED, errorCode: null, errorMessage: null });
      try {
        await withQueueTimeout(this.queue.add(
          JOBS.PUBLISH_PLATFORM,
          { publishingJobId: job.id },
          { jobId: job.id, attempts: PUBLISH_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
        ));
        await this.jobs.update({ id: job.id }, { queueJobId: job.id });
        await this.log(job.id, 'info', 'job.queued', `Queued for ${PLATFORM_NAMES[pp.platform]}`);
        response.jobs.push({ jobId: job.id, postPlatformId: pp.id, platform: pp.platform, accountName: account!.accountName, status: PublishingJobStatus.PENDING });
      } catch (err) {
        this.logger.error({ err: (err as Error).message }, 'Failed to enqueue publishing job');
        await this.failJob(job, pp, { code: ErrorCode.PUBLISH_FAILED, message: 'Background queue unavailable (is Redis running?)', retryable: true });
        response.jobs.push({ jobId: job.id, postPlatformId: pp.id, platform: pp.platform, accountName: account!.accountName, status: PublishingJobStatus.FAILED });
      }
    }

    await this.posts.recomputeStatus(post.id);
    if (triggeredBy) {
      await this.audit.log({ action: 'post.publish', userId: triggeredBy, brandId: post.brandId, entityType: 'post', entityId: post.id, metadata: { batchId, platforms: targets.map((t) => t.platform) } });
    }
    await this.notifyIfBatchDone(batchId);
    return response;
  }

  // ---------------------------------------------------------------- worker

  /** Executes one platform job. Throws only to ask BullMQ for a retry. */
  async processJob(jobId: string, attemptsMade: number): Promise<void> {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job || job.status === PublishingJobStatus.COMPLETED || job.status === PublishingJobStatus.CANCELLED || job.status === PublishingJobStatus.FAILED) return;

    const pp = await this.postPlatforms.findOne({ where: { id: job.postPlatformId } });
    let post: Post;
    try {
      post = await this.posts.loadFull(job.postId);
    } catch {
      await this.jobs.update({ id: job.id }, { status: PublishingJobStatus.CANCELLED, completedAt: new Date(), errorMessage: 'Post was deleted' });
      return;
    }
    if (!pp) {
      await this.jobs.update({ id: job.id }, { status: PublishingJobStatus.CANCELLED, completedAt: new Date(), errorMessage: 'Platform removed from post' });
      return;
    }
    if (pp.status === PostPlatformStatus.PUBLISHED) {
      // Idempotency: never publish twice to the same destination.
      await this.jobs.update({ id: job.id }, { status: PublishingJobStatus.COMPLETED, completedAt: new Date(), result: { skipped: 'already published' } });
      return;
    }

    const attempt = attemptsMade + 1;
    await this.jobs.update({ id: job.id }, { status: PublishingJobStatus.PROCESSING, attempts: attempt, startedAt: job.startedAt ?? new Date() });
    await this.postPlatforms.update({ id: pp.id }, { status: PostPlatformStatus.PUBLISHING, attempts: pp.attempts + 1 });
    await this.posts.recomputeStatus(post.id);
    await this.log(job.id, 'info', 'job.started', `Attempt ${attempt}/${job.maxAttempts} - publishing to ${PLATFORM_NAMES[pp.platform]}`);

    try {
      const account = await this.accounts.findOne({ where: { id: pp.socialAccountId } });
      const precheck = this.precheck(post, pp, account ?? undefined);
      if (precheck) throw new ProviderError(precheck.message, precheck.code as ErrorCode, precheck.retryable);

      const publisher = this.registry.getConfigured(pp.platform);
      const credentials = await this.tokens.getValid(account!);
      const ctx = await this.buildContext(post, pp, account!, credentials, job.id);

      const errors = publisher.validateContent(ctx);
      if (errors.length) throw new ProviderError(errors.join(' | '), ErrorCode.CONTENT_NOT_SUPPORTED, false);

      const isVideo = post.contentType === ContentType.VIDEO || post.contentType === ContentType.REEL;
      const result = isVideo ? await publisher.publishVideo(ctx) : await publisher.publishPost(ctx);

      await this.postPlatforms.update(
        { id: pp.id },
        {
          status: PostPlatformStatus.PUBLISHED,
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
          publishedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      );
      await this.jobs.save({
        ...job,
        status: PublishingJobStatus.COMPLETED,
        attempts: attempt,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        result: { platformPostId: result.platformPostId, platformPostUrl: result.platformPostUrl, ...(result.raw ?? {}) },
      });
      await this.log(job.id, 'info', 'job.completed', `Published to ${PLATFORM_NAMES[pp.platform]}`, { platformPostId: result.platformPostId, url: result.platformPostUrl });
      await this.posts.recomputeStatus(post.id);
      await this.notifyIfBatchDone(job.batchId);
    } catch (err) {
      const failure = this.toFailure(err);
      if (failure.code === ErrorCode.TOKEN_EXPIRED) {
        const account = await this.accounts.findOne({ where: { id: pp.socialAccountId } });
        if (account) await this.tokens.markExpired(account, failure.message);
        failure.retryable = false;
      }
      const canRetry = failure.retryable && attempt < job.maxAttempts;
      if (canRetry) {
        await this.jobs.update({ id: job.id }, { status: PublishingJobStatus.PENDING, errorCode: failure.code, errorMessage: failure.message });
        await this.postPlatforms.update({ id: pp.id }, { status: PostPlatformStatus.QUEUED, errorCode: failure.code, errorMessage: failure.message });
        await this.log(job.id, 'warn', 'job.retrying', `Attempt ${attempt} failed, will retry: ${failure.message}`);
        throw err instanceof Error ? err : new Error(failure.message);
      }
      await this.failJob({ ...job, attempts: attempt }, pp, failure);
      await this.posts.recomputeStatus(post.id);
      await this.notifyIfBatchDone(job.batchId);
    }
  }

  // ---------------------------------------------------------------- queries

  async platformStatus(userId: string, postId: string): Promise<{ postId: string; status: PostStatus; platforms: PlatformStatusDto[] }> {
    const post = await this.posts.getAccessiblePost(userId, postId);
    const latest = await this.jobs
      .createQueryBuilder('j')
      .where('j.post_id = :postId', { postId })
      .orderBy('j.created_at', 'DESC')
      .getMany();
    return {
      postId,
      status: post.status,
      platforms: post.platforms.map((pp) => ({
        postPlatformId: pp.id,
        platform: pp.platform,
        accountName: pp.socialAccount?.accountName ?? '',
        status: pp.status,
        platformPostUrl: pp.platformPostUrl,
        errorCode: pp.errorCode,
        errorMessage: pp.errorMessage,
        latestJobId: latest.find((j) => j.postPlatformId === pp.id)?.id ?? null,
        attempts: pp.attempts,
        publishedAt: pp.publishedAt,
      })),
    };
  }

  async listJobs(userId: string, query: PublishingJobQueryDto): Promise<PaginatedResult<PublishingJob>> {
    let brandIds: string[];
    if (query.brandId) {
      await this.access.assert(userId, query.brandId);
      brandIds = [query.brandId];
    } else {
      brandIds = await this.access.accessibleBrandIds(userId);
    }
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);
    const [items, total] = await this.jobs.findAndCount({
      where: {
        brandId: In(brandIds),
        ...(query.postId ? { postId: query.postId } : {}),
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
      order: { createdAt: query.order },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.getJobForUser(userId, jobId);
    const logs = await this.logs.find({ where: { jobId }, order: { createdAt: 'ASC' } });
    return { ...job, logs };
  }

  // ---------------------------------------------------------------- internals

  private assertPublishable(post: Post): void {
    if (post.status === PostStatus.CANCELLED) throw new AppException(ErrorCode.POST_INVALID_STATE, 'Cancelled posts cannot be published');
    if (post.platforms.length === 0) throw new AppException(ErrorCode.POST_INVALID_STATE, 'Select at least one social account before publishing');
  }

  /** Cheap checks that do not need network access. Returns a failure or null. */
  private precheck(post: Post, pp: PostPlatform, account?: SocialAccount): Failure | null {
    if (!account || account.deletedAt) {
      return { code: ErrorCode.SOCIAL_ACCOUNT_NOT_CONNECTED, message: `${PLATFORM_NAMES[pp.platform]} account is no longer connected`, retryable: false };
    }
    if (account.status === SocialAccountStatus.EXPIRED || account.status === SocialAccountStatus.REVOKED) {
      return { code: ErrorCode.TOKEN_EXPIRED, message: `${PLATFORM_NAMES[pp.platform]} connection for "${account.accountName}" expired. Reconnect it and retry.`, retryable: false };
    }
    try {
      const publisher = this.registry.getConfigured(pp.platform);
      if (!publisher.capabilities.contentTypes.includes(post.contentType)) {
        return { code: ErrorCode.CONTENT_NOT_SUPPORTED, message: `${publisher.displayName} does not support ${post.contentType} posts`, retryable: false };
      }
    } catch (err) {
      return { code: (err as AppException).code ?? ErrorCode.SOCIAL_PLATFORM_NOT_CONFIGURED, message: (err as Error).message, retryable: false };
    }
    return null;
  }

  private async buildContext(post: Post, pp: PostPlatform, account: SocialAccount, credentials: OAuthCredentials, jobId: string): Promise<PublishContext> {
    const media = [...post.media].sort((a, b) => a.position - b.position).map((pm) => this.mediaFactory.create(pm.media));
    const thumbnailMedia = post.thumbnailMediaId ? await this.mediaRepo.findOne({ where: { id: post.thumbnailMediaId, brandId: post.brandId } }) : null;
    return {
      account,
      credentials,
      post,
      postPlatform: pp,
      contentType: post.contentType,
      content: composeContent(post, pp),
      media,
      thumbnail: thumbnailMedia ? this.mediaFactory.create(thumbnailMedia) : null,
      options: pp.options ?? {},
      log: (event, message, context) => this.log(jobId, 'info', event, message, context),
    };
  }

  private async failJob(job: PublishingJob, pp: PostPlatform, failure: Failure): Promise<void> {
    await this.jobs.update(
      { id: job.id },
      { status: PublishingJobStatus.FAILED, completedAt: new Date(), errorCode: failure.code, errorMessage: failure.message.slice(0, 5000), attempts: job.attempts },
    );
    await this.postPlatforms.update(
      { id: pp.id },
      { status: PostPlatformStatus.FAILED, errorCode: failure.code, errorMessage: failure.message.slice(0, 5000) },
    );
    await this.log(job.id, 'error', 'job.failed', failure.message);
  }

  private toFailure(err: unknown): Failure {
    if (err instanceof ProviderError) return { code: err.code, message: err.message, retryable: err.retryable };
    if (err instanceof AppException) return { code: err.code, message: err.message, retryable: false };
    return { code: ErrorCode.PUBLISH_FAILED, message: (err as Error)?.message ?? 'Unknown error', retryable: true };
  }

  /** Sends one summary notification when every job of a batch has finished. */
  private async notifyIfBatchDone(batchId: string): Promise<void> {
    const batch = await this.jobs.find({ where: { batchId } });
    if (batch.length === 0 || batch.some((j) => j.status === PublishingJobStatus.PENDING || j.status === PublishingJobStatus.PROCESSING)) return;
    const recipient = batch[0].triggeredBy;
    if (!recipient) return;
    const ok = batch.filter((j) => j.status === PublishingJobStatus.COMPLETED);
    const failed = batch.filter((j) => j.status === PublishingJobStatus.FAILED);
    const names = (list: PublishingJob[]) => list.map((j) => PLATFORM_NAMES[j.platform]).join(', ');
    await this.notifications.notify({
      userId: recipient,
      brandId: batch[0].brandId,
      type: failed.length ? NotificationType.PUBLISH_FAILED : NotificationType.PUBLISH_SUCCESS,
      title: failed.length
        ? ok.length
          ? `Published to ${ok.length} of ${batch.length} platforms`
          : `Publishing failed on ${names(failed)}`
        : `Published to ${names(ok)}`,
      body: failed.length ? `Failed: ${failed.map((f) => `${PLATFORM_NAMES[f.platform]} - ${f.errorMessage ?? 'error'}`).join('; ').slice(0, 1000)}` : undefined,
      data: { postId: batch[0].postId, batchId },
    });
  }

  private async getJobForUser(userId: string, jobId: string, minRole: BrandRole = BrandRole.VIEWER): Promise<PublishingJob> {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw AppException.notFound(ErrorCode.PUBLISH_JOB_NOT_FOUND, 'Publishing job not found');
    await this.access.assert(userId, job.brandId, minRole).catch((err: unknown) => {
      if (err instanceof AppException && err.code === ErrorCode.BRAND_ACCESS_DENIED) throw err;
      throw AppException.notFound(ErrorCode.PUBLISH_JOB_NOT_FOUND, 'Publishing job not found');
    });
    return job;
  }

  private async log(jobId: string, level: 'info' | 'warn' | 'error', event: string, message: string, context?: Record<string, unknown>): Promise<void> {
    try {
      await this.logs.save(this.logs.create({ jobId, level, event, message: message.slice(0, 5000), context: context ?? null }));
      this.logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']({ jobId, event }, message);
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Failed to write publishing log');
    }
  }
}
