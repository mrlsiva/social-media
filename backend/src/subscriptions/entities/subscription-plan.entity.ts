import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity, decimalTransformer } from '../../common/entities/base.entity';
import { UsageLimit } from './usage-limit.entity';

@Entity('subscription_plans')
export class SubscriptionPlan extends BaseEntity {
  /** free | starter | business | enterprise ... */
  @Index('uq_subscription_plans_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimalTransformer })
  priceMonthly: number;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimalTransformer })
  priceYearly: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  /** Marketing feature bullet points. */
  @Column({ type: 'json', nullable: true })
  features: string[] | null;

  @OneToMany(() => UsageLimit, (l) => l.plan)
  limits: UsageLimit[];
}
