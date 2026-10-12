import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SubscriptionStatus } from '../common/enums';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UsageLimit } from './entities/usage-limit.entity';
import { UsageService } from './usage.service';
import { AssignPlanDto, UpsertPlanDto } from './dto/subscription.dto';
import { AiGenerationUsage } from '../ai/entities/ai-generation-usage.entity';
import { PaginatedResult } from '../common/dto/paginated-result';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { currentPeriod } from '../common/utils/duration';
import { User } from '../users/entities/user.entity';

export interface AdminAccountRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  isActive: boolean;
  createdAt: Date;
  status: string | null;
  since: Date | null;
  source: string | null;
  planCode: string | null;
  planName: string | null;
  isDefaultPlan: boolean;
  /** This month's AI usage by metric, e.g. { ai_image: 3, ai_generations: 5 }. */
  aiUsage: Record<string, number>;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(UsageLimit) private readonly limits: Repository<UsageLimit>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    private readonly usage: UsageService,
  ) {}

  listPlans(includeInactive = false): Promise<SubscriptionPlan[]> {
    return this.plans.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { limits: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Every new account starts on the plan flagged `is_default` (Free). */
  async ensureDefaultSubscription(userId: string): Promise<void> {
    const existing = await this.subscriptions.count({ where: { userId } });
    if (existing > 0) return;
    const plan = await this.plans.findOne({ where: { isDefault: true, isActive: true } });
    if (!plan) return;
    await this.subscriptions.save(
      this.subscriptions.create({
        userId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
      }),
    );
  }

  async getCurrent(userId: string) {
    const subscription = await this.subscriptions.findOne({
      where: { userId, status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]) },
      relations: { plan: { limits: true } },
      order: { createdAt: 'DESC' },
    });
    const plan = subscription?.plan ?? (await this.usage.getActivePlan(userId));
    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      plan,
      usage: await this.usage.snapshot(userId),
    };
  }

  /**
   * Admin operation: assign a plan to an account. A payment provider webhook
   * (Stripe/Razorpay) should call this once billing is integrated.
   */
  async assignPlan(dto: AssignPlanDto): Promise<Subscription> {
    const plan = await this.plans.findOne({ where: { code: dto.planCode, isActive: true } });
    if (!plan) throw AppException.notFound(ErrorCode.PLAN_NOT_FOUND, 'Plan not found');
    if (!(await this.subscriptions.manager.exists(User, { where: { id: dto.userId } }))) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'User not found');
    }

    await this.subscriptions.update(
      { userId: dto.userId, status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]) },
      { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    );
    return this.subscriptions.save(
      this.subscriptions.create({
        userId: dto.userId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: dto.billingCycle ?? 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null,
        externalProvider: dto.externalProvider ?? null,
        externalId: dto.externalId ?? null,
      }),
    );
  }

  /** Admin: accounts with their current plan and this month's AI usage, newest first. */
  async listAccounts(query: PaginationQueryDto): Promise<PaginatedResult<AdminAccountRow>> {
    const qb = this.subscriptions.manager
      .createQueryBuilder(User, 'u')
      .leftJoin(Subscription, 's', 's.user_id = u.id AND s.status IN (:...live)', { live: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] })
      .leftJoin(SubscriptionPlan, 'p', 'p.id = s.plan_id')
      .select([
        'u.id AS id',
        'u.email AS email',
        'u.first_name AS firstName',
        'u.last_name AS lastName',
        'u.is_active AS isActive',
        'u.created_at AS createdAt',
        's.status AS status',
        's.current_period_start AS since',
        's.external_provider AS source',
        'p.code AS planCode',
        'p.name AS planName',
      ])
      .where('u.deleted_at IS NULL');
    if (query.search?.trim()) {
      qb.andWhere('(u.email LIKE :q OR u.first_name LIKE :q OR u.last_name LIKE :q)', { q: `%${query.search.trim()}%` });
    }
    const total = await qb.getCount();
    const rows = await qb
      .orderBy('u.created_at', query.order)
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<Omit<AdminAccountRow, 'aiUsage' | 'isDefaultPlan'> & { isActive: number | boolean }>();

    const usage = rows.length
      ? await this.subscriptions.manager.find(AiGenerationUsage, { where: { accountId: In(rows.map((r) => r.id)), period: currentPeriod() } })
      : [];
    const defaultPlan = await this.plans.findOne({ where: { isDefault: true, isActive: true } });
    const items = rows.map((r) => ({
      ...r,
      isActive: Boolean(r.isActive),
      // No subscription row means the account runs on the default plan.
      planCode: r.planCode ?? defaultPlan?.code ?? null,
      planName: r.planName ?? defaultPlan?.name ?? null,
      isDefaultPlan: !r.planCode,
      aiUsage: Object.fromEntries(usage.filter((u) => u.accountId === r.id).map((u) => [u.metric, u.count])),
    }));
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  /** Admin operation: create or update a plan and its limits. */
  async upsertPlan(dto: UpsertPlanDto): Promise<SubscriptionPlan> {
    return this.plans.manager.transaction(async (em) => {
      let plan = await em.findOne(SubscriptionPlan, { where: { code: dto.code } });
      if (dto.isDefault) {
        await em.update(SubscriptionPlan, { isDefault: true }, { isDefault: false });
      }
      plan = em.merge(SubscriptionPlan, plan ?? em.create(SubscriptionPlan, { code: dto.code }), {
        name: dto.name,
        description: dto.description ?? null,
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        currency: dto.currency ?? 'USD',
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? 0,
        features: dto.features ?? null,
      });
      plan = await em.save(plan);

      for (const limit of dto.limits ?? []) {
        const existing = await em.findOne(UsageLimit, { where: { planId: plan.id, metric: limit.metric } });
        await em.save(
          em.merge(UsageLimit, existing ?? em.create(UsageLimit, { planId: plan.id, metric: limit.metric }), {
            limitValue: limit.limitValue,
            period: limit.period,
          }),
        );
      }
      return (await em.findOne(SubscriptionPlan, { where: { id: plan.id }, relations: { limits: true } }))!;
    });
  }
}
