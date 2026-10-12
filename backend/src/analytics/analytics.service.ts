import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BrandAccessService } from '../brands/brand-access.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PostStatus, ScheduledPostStatus, SocialAccountStatus } from '../common/enums';
import { currentPeriod, toDateString } from '../common/utils/duration';
import { AnalyticsQueryDto } from './dto/analytics.dto';

interface Totals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * Read side of analytics. Snapshots are cumulative per post/day, so:
 *  - totals use the latest snapshot per post in the range,
 *  - daily series use the day-over-day delta (window function LAG).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly access: BrandAccessService,
  ) {}

  async overview(userId: string, query: AnalyticsQueryDto) {
    const brandIds = await this.scope(userId, query.brandId);
    const { from, to } = this.range(query);
    if (brandIds.length === 0) return this.empty(from, to);

    const filters = this.filters(brandIds, query);
    const [totals, daily, followers, platforms, topPosts, published] = await Promise.all([
      this.totals(filters, from, to),
      this.daily(filters, from, to),
      this.followerSeries(brandIds, query, from, to),
      this.platformComparison(filters, brandIds, query, from, to),
      this.topPosts(filters, from, to),
      this.publishedCount(brandIds, query, from, to),
    ]);
    const currentFollowers = followers.length ? followers[followers.length - 1].followers : 0;
    return {
      range: { from, to },
      summary: {
        ...totals,
        followers: currentFollowers,
        engagement: totals.likes + totals.comments + totals.shares + totals.saves,
        engagementRate: this.engagementRate(totals),
        postsPublished: published,
      },
      daily,
      followers,
      platforms,
      topPosts,
    };
  }

  async postAnalytics(userId: string, postId: string) {
    const [post] = await this.db.query<{ brand_id: string }[]>('SELECT brand_id FROM posts WHERE id = ?', [postId]);
    if (!post) throw AppException.notFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    await this.access.assert(userId, post.brand_id);
    const rows = await this.db.query<Record<string, unknown>[]>(
      `SELECT a.platform, a.metric_date AS date, a.impressions, a.reach, a.likes, a.comments, a.shares, a.saves, a.video_views AS videoViews
         FROM analytics a WHERE a.post_id = ? ORDER BY a.metric_date ASC`,
      [postId],
    );
    const latest = new Map<string, Record<string, unknown>>();
    for (const r of rows) latest.set(String(r.platform), r);
    return {
      postId,
      platforms: [...latest.values()].map((r) => {
        const t = this.toTotals(r);
        return { platform: r.platform, ...t, engagement: t.likes + t.comments + t.shares + t.saves, engagementRate: this.engagementRate(t) };
      }),
      series: rows.map((r) => ({ ...r, date: this.dateOnly(r.date) })),
    };
  }

  async campaignAnalytics(userId: string, campaignId: string) {
    const [campaign] = await this.db.query<{ brand_id: string; name: string; start_date: string | Date; end_date: string | Date }[]>(
      'SELECT brand_id, name, start_date, end_date FROM campaigns WHERE id = ? AND deleted_at IS NULL',
      [campaignId],
    );
    if (!campaign) throw AppException.notFound(ErrorCode.CAMPAIGN_NOT_FOUND, 'Campaign not found');
    await this.access.assert(userId, campaign.brand_id);
    const from = this.dateOnly(campaign.start_date);
    const to = toDateString(new Date());
    const filters = this.filters([campaign.brand_id], { campaignId });
    const [totals, daily, platforms, topPosts] = await Promise.all([
      this.totals(filters, from, to),
      this.daily(filters, from, to),
      this.platformComparison(filters, [campaign.brand_id], {}, from, to),
      this.topPosts(filters, from, to),
    ]);
    return {
      campaignId,
      name: campaign.name,
      summary: { ...totals, engagement: totals.likes + totals.comments + totals.shares + totals.saves, engagementRate: this.engagementRate(totals) },
      daily,
      platforms,
      topPosts,
    };
  }

  /** Dashboard counters for the user (optionally one brand). */
  async dashboard(userId: string, brandId?: string) {
    const brandIds = await this.scope(userId, brandId);
    const empty = { brands: 0, posts: 0, scheduled: 0, published: 0, failed: 0, drafts: 0, aiGenerations: 0, connectedAccounts: 0, engagement: 0, reach: 0 };
    if (brandIds.length === 0) return { counts: empty, upcoming: [], recentFailures: [], recentPosts: [] };
    const ph = brandIds.map(() => '?').join(',');

    const [postCounts] = await this.db.query<Record<string, string>[]>(
      `SELECT COUNT(*) AS total,
              SUM(status = ?) AS scheduled,
              SUM(status IN (?, ?)) AS published,
              SUM(status = ?) AS failed,
              SUM(status = ?) AS drafts
         FROM posts WHERE deleted_at IS NULL AND brand_id IN (${ph})`,
      [PostStatus.SCHEDULED, PostStatus.PUBLISHED, PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED, PostStatus.DRAFT, ...brandIds],
    );
    const [accounts] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt FROM social_accounts WHERE deleted_at IS NULL AND status = ? AND brand_id IN (${ph})`,
      [SocialAccountStatus.CONNECTED, ...brandIds],
    );
    const [ai] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt FROM ai_generations WHERE brand_id IN (${ph}) AND DATE_FORMAT(created_at, '%Y-%m') = ?`,
      [...brandIds, currentPeriod()],
    );
    const { from, to } = this.range({});
    const totals = await this.totals(this.filters(brandIds, {}), from, to);

    const upcoming = await this.db.query<Record<string, unknown>[]>(
      `SELECT p.id, p.brand_id AS brandId, p.title, p.caption, p.content_type AS contentType, sp.scheduled_at AS scheduledAt
         FROM scheduled_posts sp JOIN posts p ON p.id = sp.post_id AND p.deleted_at IS NULL
        WHERE sp.status IN (?, ?) AND sp.brand_id IN (${ph}) AND sp.scheduled_at >= NOW()
        ORDER BY sp.scheduled_at ASC LIMIT 5`,
      [ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED, ...brandIds],
    );
    const recentFailures = await this.db.query<Record<string, unknown>[]>(
      `SELECT j.id AS jobId, j.post_id AS postId, j.platform, j.error_code AS errorCode, j.error_message AS errorMessage, j.completed_at AS failedAt
         FROM publishing_jobs j
        WHERE j.status = 'failed' AND j.brand_id IN (${ph}) AND j.completed_at >= NOW() - INTERVAL 7 DAY
        ORDER BY j.completed_at DESC LIMIT 5`,
      brandIds,
    );
    const recentPosts = await this.db.query<Record<string, unknown>[]>(
      `SELECT id, brand_id AS brandId, title, caption, content_type AS contentType, status, COALESCE(published_at, scheduled_at, created_at) AS date
         FROM posts WHERE deleted_at IS NULL AND brand_id IN (${ph}) ORDER BY updated_at DESC LIMIT 6`,
      brandIds,
    );

    return {
      counts: {
        brands: brandIds.length,
        posts: n(postCounts?.total),
        scheduled: n(postCounts?.scheduled),
        published: n(postCounts?.published),
        failed: n(postCounts?.failed),
        drafts: n(postCounts?.drafts),
        aiGenerations: n(ai?.cnt),
        connectedAccounts: n(accounts?.cnt),
        engagement: totals.likes + totals.comments + totals.shares + totals.saves,
        reach: totals.reach,
      },
      upcoming,
      recentFailures,
      recentPosts,
    };
  }

  // ---------------------------------------------------------------- queries

  private async totals(f: { sql: string; params: unknown[] }, from: string, to: string): Promise<Totals> {
    const [row] = await this.db.query<Record<string, string>[]>(
      `SELECT COALESCE(SUM(a.impressions),0) AS impressions, COALESCE(SUM(a.reach),0) AS reach, COALESCE(SUM(a.likes),0) AS likes,
              COALESCE(SUM(a.comments),0) AS comments, COALESCE(SUM(a.shares),0) AS shares, COALESCE(SUM(a.saves),0) AS saves,
              COALESCE(SUM(a.video_views),0) AS videoViews
         FROM analytics a
         JOIN (SELECT post_platform_id, MAX(metric_date) AS md FROM analytics a WHERE ${f.sql} AND a.metric_date BETWEEN ? AND ? GROUP BY post_platform_id) l
           ON l.post_platform_id = a.post_platform_id AND l.md = a.metric_date`,
      [...f.params, from, to],
    );
    return this.toTotals(row ?? {});
  }

  private async daily(f: { sql: string; params: unknown[] }, from: string, to: string) {
    const rows = await this.db.query<Record<string, unknown>[]>(
      `SELECT d.metric_date AS date,
              SUM(GREATEST(d.reach - d.prev_reach, 0)) AS reach,
              SUM(GREATEST(d.impressions - d.prev_impressions, 0)) AS impressions,
              SUM(GREATEST(d.engagement - d.prev_engagement, 0)) AS engagement,
              SUM(GREATEST(d.video_views - d.prev_views, 0)) AS videoViews
         FROM (
           SELECT a.metric_date, a.reach, a.impressions, a.video_views,
                  (a.likes + a.comments + a.shares + a.saves) AS engagement,
                  COALESCE(LAG(a.reach) OVER w, 0) AS prev_reach,
                  COALESCE(LAG(a.impressions) OVER w, 0) AS prev_impressions,
                  COALESCE(LAG(a.likes + a.comments + a.shares + a.saves) OVER w, 0) AS prev_engagement,
                  COALESCE(LAG(a.video_views) OVER w, 0) AS prev_views
             FROM analytics a
            WHERE ${f.sql} AND a.metric_date <= ?
           WINDOW w AS (PARTITION BY a.post_platform_id ORDER BY a.metric_date)
         ) d
        WHERE d.metric_date BETWEEN ? AND ?
        GROUP BY d.metric_date ORDER BY d.metric_date ASC`,
      [...f.params, to, from, to],
    );
    const byDate = new Map(rows.map((r) => [this.dateOnly(r.date), r]));
    return this.dates(from, to).map((date) => {
      const r = byDate.get(date);
      return { date, reach: n(r?.reach), impressions: n(r?.impressions), engagement: n(r?.engagement), videoViews: n(r?.videoViews) };
    });
  }

  private async followerSeries(brandIds: string[], query: AnalyticsQueryDto, from: string, to: string) {
    const ph = brandIds.map(() => '?').join(',');
    const rows = await this.db.query<{ date: string | Date; followers: string }[]>(
      `SELECT metric_date AS date, SUM(followers) AS followers FROM platform_analytics
        WHERE brand_id IN (${ph}) ${query.platform ? 'AND platform = ?' : ''} AND metric_date BETWEEN ? AND ?
        GROUP BY metric_date ORDER BY metric_date ASC`,
      [...brandIds, ...(query.platform ? [query.platform] : []), from, to],
    );
    return rows.map((r) => ({ date: this.dateOnly(r.date), followers: n(r.followers) }));
  }

  private async platformComparison(f: { sql: string; params: unknown[] }, brandIds: string[], query: AnalyticsQueryDto, from: string, to: string) {
    const rows = await this.db.query<Record<string, unknown>[]>(
      `SELECT a.platform, COUNT(DISTINCT a.post_platform_id) AS posts,
              SUM(a.impressions) AS impressions, SUM(a.reach) AS reach, SUM(a.likes) AS likes, SUM(a.comments) AS comments,
              SUM(a.shares) AS shares, SUM(a.saves) AS saves, SUM(a.video_views) AS videoViews
         FROM analytics a
         JOIN (SELECT post_platform_id, MAX(metric_date) AS md FROM analytics a WHERE ${f.sql} AND a.metric_date BETWEEN ? AND ? GROUP BY post_platform_id) l
           ON l.post_platform_id = a.post_platform_id AND l.md = a.metric_date
        GROUP BY a.platform`,
      [...f.params, from, to],
    );
    const ph = brandIds.map(() => '?').join(',');
    const followers = await this.db.query<{ platform: string; followers: string }[]>(
      `SELECT pa.platform, SUM(pa.followers) AS followers FROM platform_analytics pa
         JOIN (SELECT social_account_id, MAX(metric_date) AS md FROM platform_analytics WHERE brand_id IN (${ph}) AND metric_date <= ? GROUP BY social_account_id) l
           ON l.social_account_id = pa.social_account_id AND l.md = pa.metric_date
        ${query.platform ? 'WHERE pa.platform = ?' : ''}
        GROUP BY pa.platform`,
      [...brandIds, to, ...(query.platform ? [query.platform] : [])],
    );
    const platforms = new Set([...rows.map((r) => String(r.platform)), ...followers.map((f2) => f2.platform)]);
    return [...platforms].map((platform) => {
      const t = this.toTotals(rows.find((r) => r.platform === platform) ?? {});
      return {
        platform,
        posts: n(rows.find((r) => r.platform === platform)?.posts),
        ...t,
        engagement: t.likes + t.comments + t.shares + t.saves,
        engagementRate: this.engagementRate(t),
        followers: n(followers.find((x) => x.platform === platform)?.followers),
      };
    });
  }

  private async topPosts(f: { sql: string; params: unknown[] }, from: string, to: string) {
    const rows = await this.db.query<Record<string, unknown>[]>(
      `SELECT a.post_id AS postId, p.title, p.caption, p.content_type AS contentType,
              SUM(a.reach) AS reach, SUM(a.impressions) AS impressions, SUM(a.likes + a.comments + a.shares + a.saves) AS engagement,
              GROUP_CONCAT(DISTINCT a.platform) AS platforms
         FROM analytics a
         JOIN (SELECT post_platform_id, MAX(metric_date) AS md FROM analytics a WHERE ${f.sql} AND a.metric_date BETWEEN ? AND ? GROUP BY post_platform_id) l
           ON l.post_platform_id = a.post_platform_id AND l.md = a.metric_date
         JOIN posts p ON p.id = a.post_id
        GROUP BY a.post_id, p.title, p.caption, p.content_type
        ORDER BY engagement DESC, reach DESC LIMIT 5`,
      [...f.params, from, to],
    );
    return rows.map((r) => ({
      postId: r.postId,
      title: r.title ?? String(r.caption ?? '').slice(0, 80),
      contentType: r.contentType,
      platforms: String(r.platforms ?? '').split(',').filter(Boolean),
      reach: n(r.reach),
      impressions: n(r.impressions),
      engagement: n(r.engagement),
    }));
  }

  private async publishedCount(brandIds: string[], query: AnalyticsQueryDto, from: string, to: string): Promise<number> {
    const ph = brandIds.map(() => '?').join(',');
    const [row] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt FROM post_platforms pp JOIN posts p ON p.id = pp.post_id AND p.deleted_at IS NULL
        WHERE p.brand_id IN (${ph}) AND pp.status = 'published' AND DATE(pp.published_at) BETWEEN ? AND ?
        ${query.platform ? 'AND pp.platform = ?' : ''} ${query.campaignId ? 'AND p.campaign_id = ?' : ''}`,
      [...brandIds, from, to, ...(query.platform ? [query.platform] : []), ...(query.campaignId ? [query.campaignId] : [])],
    );
    return n(row?.cnt);
  }

  // ---------------------------------------------------------------- helpers

  private filters(brandIds: string[], query: Pick<AnalyticsQueryDto, 'platform' | 'campaignId'>) {
    const parts = [`a.brand_id IN (${brandIds.map(() => '?').join(',')})`];
    const params: unknown[] = [...brandIds];
    if (query.platform) {
      parts.push('a.platform = ?');
      params.push(query.platform);
    }
    if (query.campaignId) {
      parts.push('a.campaign_id = ?');
      params.push(query.campaignId);
    }
    return { sql: parts.join(' AND '), params };
  }

  private async scope(userId: string, brandId?: string): Promise<string[]> {
    if (brandId) {
      await this.access.assert(userId, brandId);
      return [brandId];
    }
    return this.access.accessibleBrandIds(userId);
  }

  private range(query: Pick<AnalyticsQueryDto, 'from' | 'to'>) {
    const to = query.to ? query.to.slice(0, 10) : toDateString(new Date());
    const from = query.from ? query.from.slice(0, 10) : toDateString(new Date(Date.now() - 29 * 86_400_000));
    if (from > to) throw new AppException(ErrorCode.VALIDATION_FAILED, '"from" must be before "to"');
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Range is limited to one year');
    return { from, to };
  }

  private dates(from: string, to: string): string[] {
    const out: string[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); toDateString(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(toDateString(d));
    return out;
  }

  private dateOnly(value: unknown): string {
    if (value instanceof Date) return toDateString(value);
    return String(value).slice(0, 10);
  }

  private toTotals(r: Record<string, unknown>): Totals {
    return {
      impressions: n(r.impressions),
      reach: n(r.reach),
      likes: n(r.likes),
      comments: n(r.comments),
      shares: n(r.shares),
      saves: n(r.saves),
      videoViews: n(r.videoViews ?? r.video_views),
    };
  }

  /** (likes + comments + shares + saves) / reach (falls back to impressions), in %. */
  private engagementRate(t: Totals): number {
    const base = t.reach || t.impressions;
    if (!base) return 0;
    return Math.round(((t.likes + t.comments + t.shares + t.saves) / base) * 10000) / 100;
  }

  private empty(from: string, to: string) {
    const zero = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, videoViews: 0 };
    return {
      range: { from, to },
      summary: { ...zero, followers: 0, engagement: 0, engagementRate: 0, postsPublished: 0 },
      daily: this.dates(from, to).map((date) => ({ date, reach: 0, impressions: 0, engagement: 0, videoViews: 0 })),
      followers: [],
      platforms: [],
      topPosts: [],
    };
  }
}
