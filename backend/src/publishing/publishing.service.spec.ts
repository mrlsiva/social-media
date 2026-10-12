import { ContentType, PostPlatformStatus, PostStatus, PublishingJobStatus, SocialAccountStatus, SocialPlatform } from '../common/enums';
import { ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PublishingService } from './publishing.service';
import { SocialPublisher } from './interfaces/social-publisher.interface';

/**
 * PublishingService with in-memory repositories and mocked platform publishers.
 * No real social API is ever called.
 */
type Row = Record<string, any>;

function memoryRepo(rows: Row[] = []) {
  const match = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && '_value' in v ? (v as { _value: unknown[] })._value.includes(row[k]) : row[k] === v));
  let seq = 0;
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    save: jest.fn(async (data: Row) => {
      const row = data.id ? rows.find((r) => r.id === data.id) : undefined;
      if (row) Object.assign(row, data);
      else rows.push(Object.assign(data, { id: data.id ?? `id-${++seq}`, createdAt: new Date() }));
      return data;
    }),
    update: jest.fn(async (where: Row, patch: Row) => {
      rows.filter((r) => match(r, where)).forEach((r) => Object.assign(r, patch));
      return { affected: 1 };
    }),
    findOne: jest.fn(async ({ where }: { where: Row }) => rows.find((r) => match(r, where)) ?? null),
    find: jest.fn(async (opts: { where?: Row } = {}) => rows.filter((r) => match(r, opts.where))),
  };
}

function setup(opts: { accounts?: Row[]; publishers?: Partial<Record<SocialPlatform, Partial<SocialPublisher>>> } = {}) {
  const accounts = opts.accounts ?? [
    { id: 'acc-ig', brandId: 'brand-1', platform: SocialPlatform.INSTAGRAM, accountName: 'Sling IG', status: SocialAccountStatus.CONNECTED, platformAccountId: '178' },
    { id: 'acc-fb', brandId: 'brand-1', platform: SocialPlatform.FACEBOOK, accountName: 'Sling FB', status: SocialAccountStatus.CONNECTED, platformAccountId: '999' },
  ];
  const postPlatforms = accounts.map((a, i) => ({
    id: `pp-${i}`,
    postId: 'post-1',
    socialAccountId: a.id,
    platform: a.platform,
    status: PostPlatformStatus.PENDING,
    attempts: 0,
    socialAccount: a,
  }));
  const post = {
    id: 'post-1',
    brandId: 'brand-1',
    contentType: ContentType.IMAGE,
    caption: 'Diwali offer',
    hashtags: ['diwali'],
    status: PostStatus.DRAFT,
    media: [{ mediaId: 'm1', position: 0, media: { id: 'm1', mimeType: 'image/jpeg', storageKey: 'k', sizeBytes: 10 } }],
    platforms: postPlatforms,
  };

  const jobs = memoryRepo();
  const logs = memoryRepo();
  const ppRepo = memoryRepo(postPlatforms);
  const accountRepo = memoryRepo(accounts);
  const mediaRepo = memoryRepo();
  const queue = { add: jest.fn().mockResolvedValue({ id: 'q' }) };
  const posts = {
    getAccessiblePost: jest.fn().mockResolvedValue(post),
    loadFull: jest.fn().mockResolvedValue(post),
    recomputeStatus: jest.fn().mockResolvedValue(PostStatus.PUBLISHING),
  };
  const tokens = { getValid: jest.fn().mockResolvedValue({ accessToken: 'secret-token' }), markExpired: jest.fn() };

  const makePublisher = (platform: SocialPlatform): SocialPublisher =>
    ({
      platform,
      displayName: platform,
      usesPkce: false,
      capabilities: { contentTypes: Object.values(ContentType), maxCaptionLength: 2200, maxHashtags: 30, maxCarouselItems: 10, requiresMedia: false, supportsLinks: true },
      isConfigured: () => true,
      validateContent: () => [],
      publishPost: jest.fn().mockResolvedValue({ platformPostId: `${platform}-post`, platformPostUrl: `https://${platform}.example/p/1` }),
      publishVideo: jest.fn(),
      ...(opts.publishers?.[platform] ?? {}),
    }) as unknown as SocialPublisher;
  const publishers = new Map<string, SocialPublisher>(accounts.map((a) => [a.platform, makePublisher(a.platform)]));
  const registry = { get: (p: string) => publishers.get(p)!, getConfigured: (p: string) => publishers.get(p)! };
  const mediaFactory = { create: jest.fn((m: Row) => ({ id: m.id, kind: 'image', url: 'https://cdn/x.jpg', isPubliclyReachable: true })) };
  const notifications = { notify: jest.fn() };
  const access = { assert: jest.fn().mockResolvedValue({ role: 'owner' }), accessibleBrandIds: jest.fn() };
  const audit = { log: jest.fn() };

  const service = new PublishingService(
    jobs as never,
    logs as never,
    ppRepo as never,
    accountRepo as never,
    mediaRepo as never,
    queue as never,
    posts as never,
    tokens as never,
    registry as never,
    mediaFactory as never,
    notifications as never,
    access as never,
    audit as never,
  );
  return { service, jobs, logs, ppRepo, queue, posts, tokens, publishers, notifications, post };
}

describe('PublishingService', () => {
  it('Publish to All creates one queued job per platform in a single batch', async () => {
    const { service, queue, jobs } = setup();
    const result = await service.publishAll('user-1', 'post-1');

    expect(result.jobs).toHaveLength(2);
    expect(new Set(jobs.rows.map((j) => j.batchId)).size).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(result.jobs.map((j) => j.status)).toEqual([PublishingJobStatus.PENDING, PublishingJobStatus.PENDING]);
  });

  it('records a disconnected account as failed without failing the whole batch', async () => {
    const { service, queue } = setup({
      accounts: [
        { id: 'acc-ig', brandId: 'brand-1', platform: SocialPlatform.INSTAGRAM, accountName: 'IG', status: SocialAccountStatus.CONNECTED },
        { id: 'acc-li', brandId: 'brand-1', platform: SocialPlatform.LINKEDIN, accountName: 'LI', status: SocialAccountStatus.EXPIRED },
      ],
    });
    const result = await service.publishAll('user-1', 'post-1');

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(result.skipped).toEqual([expect.objectContaining({ platform: SocialPlatform.LINKEDIN, errorCode: ErrorCode.TOKEN_EXPIRED })]);
    expect(result.jobs.find((j) => j.platform === SocialPlatform.INSTAGRAM)?.status).toBe(PublishingJobStatus.PENDING);
  });

  it('marks a platform failed (not the batch) when the queue is unavailable', async () => {
    const { service, queue, ppRepo } = setup();
    queue.add.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await service.publishAll('user-1', 'post-1');

    expect(result.jobs.map((j) => j.status)).toEqual([PublishingJobStatus.FAILED, PublishingJobStatus.PENDING]);
    expect(ppRepo.rows[0].status).toBe(PostPlatformStatus.FAILED);
  });

  it('processJob publishes and stores the platform post id/url', async () => {
    const { service, jobs, ppRepo, publishers } = setup();
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.INSTAGRAM)!;

    await service.processJob(job.id, 0);

    expect(publishers.get(SocialPlatform.INSTAGRAM)!.publishPost).toHaveBeenCalledTimes(1);
    expect(job.status).toBe(PublishingJobStatus.COMPLETED);
    const pp = ppRepo.rows.find((p) => p.id === job.postPlatformId)!;
    expect(pp).toMatchObject({ status: PostPlatformStatus.PUBLISHED, platformPostId: 'instagram-post', platformPostUrl: 'https://instagram.example/p/1' });
  });

  it('never publishes twice to a platform that is already published (idempotent retries)', async () => {
    const { service, jobs, ppRepo, publishers } = setup();
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.INSTAGRAM)!;
    ppRepo.rows.find((p) => p.id === job.postPlatformId)!.status = PostPlatformStatus.PUBLISHED;

    await service.processJob(job.id, 0);

    expect(publishers.get(SocialPlatform.INSTAGRAM)!.publishPost).not.toHaveBeenCalled();
    expect(job.status).toBe(PublishingJobStatus.COMPLETED);
  });

  it('rethrows retryable errors so BullMQ retries, keeping the platform queued', async () => {
    const { service, jobs, ppRepo } = setup({
      publishers: { [SocialPlatform.FACEBOOK]: { publishPost: jest.fn().mockRejectedValue(new ProviderError('Graph 500', ErrorCode.PLATFORM_API_ERROR, true)) } },
    });
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.FACEBOOK)!;

    await expect(service.processJob(job.id, 0)).rejects.toThrow('Graph 500');
    expect(job.status).toBe(PublishingJobStatus.PENDING);
    expect(ppRepo.rows.find((p) => p.id === job.postPlatformId)!.status).toBe(PostPlatformStatus.QUEUED);
  });

  it('marks the job failed with the platform error after the last attempt', async () => {
    const { service, jobs, ppRepo } = setup({
      publishers: { [SocialPlatform.FACEBOOK]: { publishPost: jest.fn().mockRejectedValue(new ProviderError('Graph 500', ErrorCode.PLATFORM_API_ERROR, true)) } },
    });
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.FACEBOOK)!;

    await service.processJob(job.id, 2); // third (final) attempt

    expect(job).toMatchObject({ status: PublishingJobStatus.FAILED, errorCode: ErrorCode.PLATFORM_API_ERROR });
    expect(ppRepo.rows.find((p) => p.id === job.postPlatformId)).toMatchObject({ status: PostPlatformStatus.FAILED, errorMessage: 'Graph 500' });
  });

  it('flags the account as expired on TOKEN_EXPIRED and does not retry', async () => {
    const { service, jobs, tokens } = setup({
      publishers: { [SocialPlatform.INSTAGRAM]: { publishPost: jest.fn().mockRejectedValue(new ProviderError('token invalid', ErrorCode.TOKEN_EXPIRED, false)) } },
    });
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.INSTAGRAM)!;

    await service.processJob(job.id, 0);

    expect(tokens.markExpired).toHaveBeenCalled();
    expect(job.status).toBe(PublishingJobStatus.FAILED);
  });

  it('fails without calling the API when platform validation rejects the content', async () => {
    const publishPost = jest.fn();
    const { service, jobs } = setup({
      publishers: { [SocialPlatform.INSTAGRAM]: { validateContent: () => ['Instagram only accepts JPEG'], publishPost } },
    });
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows.find((j) => j.platform === SocialPlatform.INSTAGRAM)!;

    await service.processJob(job.id, 0);

    expect(publishPost).not.toHaveBeenCalled();
    expect(job).toMatchObject({ status: PublishingJobStatus.FAILED, errorCode: ErrorCode.CONTENT_NOT_SUPPORTED });
  });

  it('retries only failed jobs, as a new job linked to the failed one', async () => {
    const { service, jobs, queue, ppRepo } = setup();
    await service.publishAll('user-1', 'post-1');
    const job = jobs.rows[0];
    await expect(service.retryJob('user-1', job.id)).rejects.toMatchObject({ code: ErrorCode.POST_INVALID_STATE });

    job.status = PublishingJobStatus.FAILED;
    ppRepo.rows.find((p) => p.id === job.postPlatformId)!.status = PostPlatformStatus.FAILED;
    queue.add.mockClear();

    const result = await service.retryJob('user-1', job.id);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(jobs.rows.find((j) => j.id === result.jobs[0].jobId)).toMatchObject({ retryOfJobId: job.id, status: PublishingJobStatus.PENDING });
  });

  it('never writes OAuth tokens into publishing logs', async () => {
    const { service, jobs, logs } = setup();
    await service.publishAll('user-1', 'post-1');
    for (const job of [...jobs.rows]) await service.processJob(job.id, 0);
    expect(JSON.stringify(logs.rows)).not.toContain('secret-token');
  });
});
