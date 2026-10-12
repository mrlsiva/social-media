import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AiGenerationStatus, AiGenerationType } from '../../common/enums';

/** History of every AI request (text sync, image/video async jobs). */
@Entity('ai_generations')
@Index('idx_ai_generations_user', ['userId', 'createdAt'])
@Index('idx_ai_generations_brand', ['brandId', 'type', 'createdAt'])
export class AiGeneration extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** Account whose subscription is charged (brand owner). */
  @Column({ name: 'account_id', type: 'varchar', length: 36 })
  accountId: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 36, nullable: true })
  brandId: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: AiGenerationType;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 20, default: AiGenerationStatus.PENDING })
  status: AiGenerationStatus;

  @Column({ type: 'json' })
  input: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  output: unknown;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** Provider-side job id for async generations (e.g. video). */
  @Column({ type: 'varchar', name: 'external_job_id', length: 191, nullable: true })
  externalJobId: string | null;

  @Column({ name: 'result_media_id', type: 'varchar', length: 36, nullable: true })
  resultMediaId: string | null;

  @Column({ name: 'tokens_used', type: 'int', unsigned: true, nullable: true })
  tokensUsed: number | null;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  progress: number | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;
}
