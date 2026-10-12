import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PostPlatformStatus, SocialAccountStatus } from '../common/enums';
import { toDateString } from '../common/utils/duration';
import { Post } from '../posts/entities/post.entity';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { PublisherRegistry } from '../publishing/publisher.registry';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { TokenService } from '../social-accounts/token.service';
import { Analytics } from './entities/analytics.entity';
import { PlatformAnalytics } from './entities/platform-analytics.entity';

const LOOKBACK_DAYS = 30;

/**
 * Pulls metrics from each platform's insights API and stores daily snapshots
 * (cumulative values per day). Runs every 6 hours and on demand.
 */
@Injectable()
export class AnalyticsSyncService {
  private readonly logger = new Logger(AnalyticsSyncService.name);

  constructor(
    @InjectRepository(Analytics) private readonly analytics: Repository<Analytics>,
    @InjectRepository(PlatformAnalytics) private readonly platformAnalytics: Repository<PlatformAnalytics>,
    @InjectRepository(PostPlatform) private readonly postPlatforms: Repository<PostPlatform>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    private readonly registry: PublisherRegistry,
    private readonly tokens: TokenService,
  ) {}

  async syncAll(): Promise<{ brands: number }> {
    const rows = await this.accounts
      .createQueryBuilder('a')
      .select('DISTINCT a.brand_id', 'brandId')
      .where('a.status = :status', { status: SocialAccountStatus.CONNECTED })
      .getRawMany<{ brandId: string }>();
    for (const { brandId } of rows) {
      await this.syncBrand(brandId).catch((err: unknown) => this.logger.warn({ brandId, err: (err as Error).message }, 'Brand analytics sync failed'));
    }
    return { brands: rows.length };
  }

  async syncBrand(brandId: string): Promise<{ posts: number; accounts: number; errors: number }> {
    const today = toDateString(new Date());
    const accounts = await this.accounts.find({ where: { brandId, status: SocialAccountStatus.CONNECTED } });
    let errors = 0;
    let postsSynced = 0;

    for (const account of accounts) {
      let publisher;
      try {
        publisher = this.registry.getConfigured(account.platform);
      } catch {
        continue;
      }
      let credentials;
      try {
        credentials = await this.tokens.getValid(account);
      } catch {
        errors++;
        continue;
      }

      if (publisher.fetchAccountMetrics) {
        try {
          const m = await publisher.fetchAccountMetrics(account, credentials);
          await this.upsertPlatform({
            brandId,
            socialAccountId: account.id,
            platform: account.platform,
            metricDate: today,
            followers: m.followers ?? 0,
            impressions: m.impressions ?? 0,
            reach: m.reach ?? 0,
            profileViews: m.profileViews ?? 0,
            engagements: m.engagements ?? 0,
            videoViews: m.videoViews ?? 0,
          });
          await this.accounts.update({ id: account.id }, { lastSyncedAt: new Date() });
        } catch (err) {
          errors++;
          await this.handleError(account, err);
        }
      }

      if (!publisher.fetchPostMetrics) continue;
      const published = await this.postPlatforms.find({
        where: {
          socialAccountId: account.id,
          status: PostPlatformStatus.PUBLISHED,
          platformPostId: Not(IsNull()),
          publishedAt: MoreThan(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)),
        },
      });
      const postRows = published.length
        ? await this.posts.find({ where: { id: In(published.map((p) => p.postId)) }, select: { id: true, campaignId: true }, withDeleted: true })
        : [];
      for (const pp of published) {
        try {
          const m = await publisher.fetchPostMetrics(account, credentials, pp.platformPostId!);
          await this.upsertPost({
            brandId,
            postId: pp.postId,
            postPlatformId: pp.id,
            campaignId: postRows.find((p) => p.id === pp.postId)?.campaignId ?? null,
            socialAccountId: account.id,
            platform: account.platform,
            metricDate: today,
            impressions: m.impressions ?? 0,
            reach: m.reach ?? 0,
            likes: m.likes ?? 0,
            comments: m.comments ?? 0,
            shares: m.shares ?? 0,
            saves: m.saves ?? 0,
            videoViews: m.videoViews ?? 0,
            clicks: m.clicks ?? 0,
          });
          postsSynced++;
        } catch (err) {
          errors++;
          if (await this.handleError(account, err)) break;
        }
      }
    }
    this.logger.log({ brandId, posts: postsSynced, accounts: accounts.length, errors }, 'Analytics synced');
    return { posts: postsSynced, accounts: accounts.length, errors };
  }

  /** Returns true when the account token is dead (stop syncing this account). */
  private async handleError(account: SocialAccount, err: unknown): Promise<boolean> {
    if (err instanceof ProviderError && err.code === ErrorCode.TOKEN_EXPIRED) {
      await this.tokens.markExpired(account, err.message);
      return true;
    }
    this.logger.debug({ accountId: account.id, err: (err as Error).message }, 'Metric fetch failed');
    return false;
  }

  private async upsertPost(row: Omit<Analytics, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const existing = await this.analytics.findOne({ where: { postPlatformId: row.postPlatformId, metricDate: row.metricDate } });
    await this.analytics.save(existing ? this.analytics.merge(existing, row) : this.analytics.create(row));
  }

  private async upsertPlatform(row: Omit<PlatformAnalytics, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const existing = await this.platformAnalytics.findOne({ where: { socialAccountId: row.socialAccountId, metricDate: row.metricDate } });
    await this.platformAnalytics.save(existing ? this.platformAnalytics.merge(existing, row) : this.platformAnalytics.create(row));
  }
}
