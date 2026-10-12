import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { LimitPeriod, ScheduledPostStatus, SubscriptionStatus, UsageMetric } from '../common/enums';
import { currentPeriod } from '../common/utils/duration';
import { AiGenerationUsage } from '../ai/entities/ai-generation-usage.entity';
import { Brand } from '../brands/entities/brand.entity';
import { BrandMember } from '../brands/entities/brand-member.entity';
import { Media } from '../media/entities/media.entity';
import { ScheduledPost } from '../scheduler/entities/scheduled-post.entity';
import { SocialAccount } from '../social-accounts/entities/social-account.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UsageLimit } from './entities/usage-limit.entity';

export interface UsageSnapshot {
  metric: UsageMetric;
  used: number;
  limit: number;
  period: LimitPeriod;
  unlimited: boolean;
}

const AI_METRICS = new Set<UsageMetric>([
  UsageMetric.AI_GENERATIONS,
  UsageMetric.AI_CAPTION,
  UsageMetric.AI_HASHTAGS,
  UsageMetric.AI_IMAGE,
  UsageMetric.AI_VIDEO,
]);

/**
 * Enforces plan limits stored in `usage_limits` (nothing is hard-coded).
 * "account" = the user who owns the brand / subscription.
 */
@Injectable()
export class UsageService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getActivePlan(accountId: string): Promise<SubscriptionPlan | null> {
    const sub = await this.db.getRepository(Subscription).findOne({
      where: { userId: accountId, status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]) },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
    });
    if (sub?.plan) return sub.plan;
    return this.db.getRepository(SubscriptionPlan).findOne({ where: { isDefault: true, isActive: true } });
  }

  async getLimit(accountId: string, metric: UsageMetric): Promise<{ limit: number; period: LimitPeriod }> {
    const plan = await this.getActivePlan(accountId);
    if (!plan) return { limit: 0, period: LimitPeriod.LIFETIME };
    const row = await this.db.getRepository(UsageLimit).findOne({ where: { planId: plan.id, metric } });
    // A metric without a configured limit is treated as unlimited.
    return row ? { limit: row.limitValue, period: row.period } : { limit: -1, period: LimitPeriod.LIFETIME };
  }

  async getUsage(accountId: string, metric: UsageMetric): Promise<number> {
    if (AI_METRICS.has(metric)) {
      const row = await this.db
        .getRepository(AiGenerationUsage)
        .findOne({ where: { accountId, period: currentPeriod(), metric } });
      return row?.count ?? 0;
    }

    switch (metric) {
      case UsageMetric.BRANDS:
        return this.db.getRepository(Brand).count({ where: { ownerId: accountId } });
      case UsageMetric.SOCIAL_ACCOUNTS:
        return this.db
          .getRepository(SocialAccount)
          .createQueryBuilder('sa')
          .innerJoin(Brand, 'b', 'b.id = sa.brand_id AND b.deleted_at IS NULL')
          .where('b.owner_id = :accountId', { accountId })
          .getCount();
      case UsageMetric.TEAM_MEMBERS: {
        const result = await this.db
          .getRepository(BrandMember)
          .createQueryBuilder('m')
          .innerJoin(Brand, 'b', 'b.id = m.brand_id AND b.deleted_at IS NULL')
          .where('b.owner_id = :accountId', { accountId })
          .andWhere('m.user_id <> :accountId', { accountId })
          .select('COUNT(DISTINCT m.user_id)', 'cnt')
          .getRawOne<{ cnt: string }>();
        return Number(result?.cnt ?? 0);
      }
      case UsageMetric.SCHEDULED_POSTS:
        return this.db
          .getRepository(ScheduledPost)
          .createQueryBuilder('sp')
          .innerJoin(Brand, 'b', 'b.id = sp.brand_id AND b.deleted_at IS NULL')
          .where('b.owner_id = :accountId', { accountId })
          .andWhere('sp.status IN (:...statuses)', { statuses: [ScheduledPostStatus.PENDING, ScheduledPostStatus.QUEUED] })
          .getCount();
      case UsageMetric.STORAGE_MB: {
        const result = await this.db
          .getRepository(Media)
          .createQueryBuilder('m')
          .innerJoin(Brand, 'b', 'b.id = m.brand_id')
          .where('b.owner_id = :accountId', { accountId })
          .select('COALESCE(SUM(m.size_bytes), 0)', 'bytes')
          .getRawOne<{ bytes: string }>();
        return Math.ceil(Number(result?.bytes ?? 0) / (1024 * 1024));
      }
      default:
        return 0;
    }
  }

  async snapshot(accountId: string): Promise<UsageSnapshot[]> {
    const metrics = Object.values(UsageMetric);
    return Promise.all(
      metrics.map(async (metric) => {
        const [{ limit, period }, used] = await Promise.all([this.getLimit(accountId, metric), this.getUsage(accountId, metric)]);
        return { metric, used, limit, period, unlimited: limit < 0 };
      }),
    );
  }

  /** Throws USAGE_LIMIT_REACHED when `increment` more units would exceed the plan limit. */
  async assertWithinLimit(accountId: string, metric: UsageMetric, increment = 1): Promise<void> {
    const { limit } = await this.getLimit(accountId, metric);
    if (limit < 0) return;
    const used = await this.getUsage(accountId, metric);
    if (used + increment > limit) {
      throw new AppException(
        ErrorCode.USAGE_LIMIT_REACHED,
        `Your plan allows ${limit} ${metric.replace(/_/g, ' ')}. Upgrade your subscription to continue.`,
        HttpStatus.PAYMENT_REQUIRED,
        { metric, limit, used },
      );
    }
  }

  /** Checks both the specific AI metric and the overall AI generations quota. */
  async assertAiQuota(accountId: string, metric: UsageMetric): Promise<void> {
    await this.assertWithinLimit(accountId, UsageMetric.AI_GENERATIONS);
    if (metric !== UsageMetric.AI_GENERATIONS) await this.assertWithinLimit(accountId, metric);
  }

  /** Atomically increments (or decrements with a negative delta) monthly AI counters. */
  async recordAiUsage(accountId: string, metric: UsageMetric, delta = 1): Promise<void> {
    const period = currentPeriod();
    const metrics = metric === UsageMetric.AI_GENERATIONS ? [metric] : [metric, UsageMetric.AI_GENERATIONS];
    for (const m of metrics) {
      await this.db.query(
        `INSERT INTO ai_generation_usage (id, account_id, period, metric, count, created_at, updated_at)
         VALUES (UUID(), ?, ?, ?, GREATEST(?, 0), NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE count = GREATEST(CAST(count AS SIGNED) + ?, 0), updated_at = NOW(3)`,
        [accountId, period, m, delta, delta],
      );
    }
  }

  /** Brand owner = the subscription account charged for brand-scoped usage. */
  async accountForBrand(brandId: string): Promise<string> {
    const brand = await this.db.getRepository(Brand).findOne({ where: { id: brandId, deletedAt: IsNull() }, select: { id: true, ownerId: true } });
    if (!brand) throw AppException.notFound(ErrorCode.BRAND_NOT_FOUND, 'Brand not found');
    return brand.ownerId;
  }
}
