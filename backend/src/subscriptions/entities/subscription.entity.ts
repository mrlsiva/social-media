import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SubscriptionStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('subscriptions')
@Index('idx_subscriptions_user_status', ['userId', 'status'])
export class Subscription extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'plan_id', type: 'varchar', length: 36 })
  planId: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({ type: 'varchar', length: 20, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', name: 'billing_cycle', length: 10, default: 'monthly' })
  billingCycle: 'monthly' | 'yearly';

  @Column({ name: 'current_period_start', type: 'datetime' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'datetime', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  /** Billing provider (stripe/razorpay...) reference for future payment integration. */
  @Column({ type: 'varchar', name: 'external_provider', length: 30, nullable: true })
  externalProvider: string | null;

  @Column({ type: 'varchar', name: 'external_id', length: 191, nullable: true })
  externalId: string | null;
}
