import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/** Monthly counters per account and metric (e.g. 2026-10 / ai_image = 12). */
@Entity('ai_generation_usage')
@Index('uq_ai_generation_usage_account_period_metric', ['accountId', 'period', 'metric'], { unique: true })
export class AiGenerationUsage extends BaseEntity {
  @Column({ name: 'account_id', type: 'varchar', length: 36 })
  accountId: string;

  /** YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  @Column({ type: 'varchar', length: 50 })
  metric: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  count: number;
}
