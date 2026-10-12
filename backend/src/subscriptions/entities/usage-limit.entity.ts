import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { LimitPeriod, UsageMetric } from '../../common/enums';
import { SubscriptionPlan } from './subscription-plan.entity';

/** Configurable plan limits. `limit_value = -1` means unlimited. */
@Entity('usage_limits')
@Index('uq_usage_limits_plan_metric', ['planId', 'metric'], { unique: true })
export class UsageLimit extends BaseEntity {
  @Column({ name: 'plan_id', type: 'varchar', length: 36 })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, (p) => p.limits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({ type: 'varchar', length: 50 })
  metric: UsageMetric;

  @Column({ name: 'limit_value', type: 'int' })
  limitValue: number;

  @Column({ type: 'varchar', length: 20, default: LimitPeriod.LIFETIME })
  period: LimitPeriod;
}
