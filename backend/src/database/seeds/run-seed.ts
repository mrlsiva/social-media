import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DataSource, EntityManager } from 'typeorm';
import { LimitPeriod, SubscriptionStatus, UsageMetric } from '../../common/enums';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { SubscriptionPlan } from '../../subscriptions/entities/subscription-plan.entity';
import { UsageLimit } from '../../subscriptions/entities/usage-limit.entity';
import { Permission } from '../../users/entities/permission.entity';
import { Role } from '../../users/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import dataSource from '../data-source';

/**
 * Idempotent seed: roles, permissions, subscription plans + limits and an admin user.
 * Limits live in the database (usage_limits) and can be edited in phpMyAdmin or via
 * PUT /api/v1/subscriptions/admin/plans - nothing here is hard-coded in the app.
 */

const PERMISSIONS: Record<string, string> = {
  'plans.manage': 'Create/update subscription plans and limits',
  'subscriptions.manage': 'Assign plans to accounts',
  'users.manage': 'Manage user accounts',
  'audit.read': 'Read audit logs',
  'settings.manage': 'Manage platform settings (AI provider keys)',
};

const ROLES: Record<string, { description: string; permissions: string[] }> = {
  admin: { description: 'Platform administrator', permissions: Object.keys(PERMISSIONS) },
  user: { description: 'Standard account', permissions: [] },
};

type Limits = Partial<Record<UsageMetric, [number, LimitPeriod]>>;
const M = LimitPeriod.MONTHLY;
const L = LimitPeriod.LIFETIME;

const PLANS: { code: string; name: string; description: string; monthly: number; yearly: number; isDefault?: boolean; features: string[]; limits: Limits }[] = [
  {
    code: 'free',
    name: 'Free',
    description: 'Try the platform with one brand',
    monthly: 0,
    yearly: 0,
    isDefault: true,
    features: ['1 brand', '3 social accounts', '10 AI generations / month', '10 scheduled posts'],
    limits: {
      [UsageMetric.BRANDS]: [1, L],
      [UsageMetric.SOCIAL_ACCOUNTS]: [3, L],
      [UsageMetric.TEAM_MEMBERS]: [0, L],
      [UsageMetric.SCHEDULED_POSTS]: [10, L],
      [UsageMetric.STORAGE_MB]: [500, L],
      [UsageMetric.AI_GENERATIONS]: [10, M],
      [UsageMetric.AI_IMAGE]: [3, M],
      [UsageMetric.AI_VIDEO]: [0, M],
    },
  },
  {
    code: 'starter',
    name: 'Starter',
    description: 'For small businesses managing a few brands',
    monthly: 19,
    yearly: 190,
    features: ['3 brands', '12 social accounts', '100 AI generations / month', '2 team members'],
    limits: {
      [UsageMetric.BRANDS]: [3, L],
      [UsageMetric.SOCIAL_ACCOUNTS]: [12, L],
      [UsageMetric.TEAM_MEMBERS]: [2, L],
      [UsageMetric.SCHEDULED_POSTS]: [200, L],
      [UsageMetric.STORAGE_MB]: [5120, L],
      [UsageMetric.AI_GENERATIONS]: [100, M],
      [UsageMetric.AI_IMAGE]: [30, M],
      [UsageMetric.AI_VIDEO]: [5, M],
    },
  },
  {
    code: 'business',
    name: 'Business',
    description: 'For growing companies and agencies',
    monthly: 59,
    yearly: 590,
    features: ['10 brands', '40 social accounts', '500 AI generations / month', '10 team members', 'AI video'],
    limits: {
      [UsageMetric.BRANDS]: [10, L],
      [UsageMetric.SOCIAL_ACCOUNTS]: [40, L],
      [UsageMetric.TEAM_MEMBERS]: [10, L],
      [UsageMetric.SCHEDULED_POSTS]: [2000, L],
      [UsageMetric.STORAGE_MB]: [51200, L],
      [UsageMetric.AI_GENERATIONS]: [500, M],
      [UsageMetric.AI_IMAGE]: [150, M],
      [UsageMetric.AI_VIDEO]: [30, M],
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited brands with custom limits',
    monthly: 0,
    yearly: 0,
    features: ['Unlimited brands', 'Unlimited social accounts', 'Custom AI quotas', 'Priority support'],
    limits: {
      [UsageMetric.BRANDS]: [-1, L],
      [UsageMetric.SOCIAL_ACCOUNTS]: [-1, L],
      [UsageMetric.TEAM_MEMBERS]: [-1, L],
      [UsageMetric.SCHEDULED_POSTS]: [-1, L],
      [UsageMetric.STORAGE_MB]: [-1, L],
      [UsageMetric.AI_GENERATIONS]: [-1, M],
      [UsageMetric.AI_IMAGE]: [-1, M],
      [UsageMetric.AI_VIDEO]: [-1, M],
    },
  },
];

async function seedRoles(em: EntityManager): Promise<Map<string, Role>> {
  const perms = new Map<string, Permission>();
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    const existing = await em.findOne(Permission, { where: { key } });
    perms.set(key, await em.save(em.merge(Permission, existing ?? em.create(Permission, { key }), { description })));
  }
  const roles = new Map<string, Role>();
  for (const [name, def] of Object.entries(ROLES)) {
    const existing = await em.findOne(Role, { where: { name }, relations: { permissions: true } });
    const role = em.merge(Role, existing ?? em.create(Role, { name }), { description: def.description });
    role.permissions = def.permissions.map((p) => perms.get(p)!);
    roles.set(name, await em.save(role));
  }
  return roles;
}

async function seedPlans(em: EntityManager): Promise<Map<string, SubscriptionPlan>> {
  const plans = new Map<string, SubscriptionPlan>();
  for (const [i, def] of PLANS.entries()) {
    const existing = await em.findOne(SubscriptionPlan, { where: { code: def.code } });
    const plan = await em.save(
      em.merge(SubscriptionPlan, existing ?? em.create(SubscriptionPlan, { code: def.code }), {
        name: def.name,
        description: def.description,
        priceMonthly: def.monthly,
        priceYearly: def.yearly,
        currency: 'USD',
        isActive: true,
        isDefault: !!def.isDefault,
        sortOrder: i,
        features: def.features,
      }),
    );
    // Only insert missing limits: values edited later by admins are preserved.
    for (const [metric, [value, period]] of Object.entries(def.limits) as [UsageMetric, [number, LimitPeriod]][]) {
      const limit = await em.findOne(UsageLimit, { where: { planId: plan.id, metric } });
      if (!limit) await em.save(em.create(UsageLimit, { planId: plan.id, metric, limitValue: value, period }));
    }
    plans.set(def.code, plan);
  }
  return plans;
}

async function seedAdmin(em: EntityManager, roles: Map<string, Role>, plans: Map<string, SubscriptionPlan>): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@socialpilot.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  let admin = await em.findOne(User, { where: { email }, relations: { roles: true } });
  if (!admin) {
    admin = await em.save(
      em.create(User, {
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        firstName: 'Platform',
        lastName: 'Admin',
        timezone: 'Asia/Kolkata',
        roles: [roles.get('admin')!, roles.get('user')!],
      }),
    );
    console.log(`  created admin user ${email} / ${password}  (change this password!)`);
  }
  if (!(await em.exists(Subscription, { where: { userId: admin.id } }))) {
    await em.save(
      em.create(Subscription, {
        userId: admin.id,
        planId: plans.get('enterprise')!.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
      }),
    );
  }
}

async function run(ds: DataSource): Promise<void> {
  await ds.initialize();
  try {
    await ds.transaction(async (em) => {
      console.log('Seeding roles & permissions...');
      const roles = await seedRoles(em);
      console.log('Seeding subscription plans & usage limits...');
      const plans = await seedPlans(em);
      console.log('Seeding admin user...');
      await seedAdmin(em, roles, plans);
    });
    console.log('Seed completed.');
  } finally {
    await ds.destroy();
  }
}

run(dataSource).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
