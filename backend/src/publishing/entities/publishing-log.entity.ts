import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PublishingJob } from './publishing-job.entity';

/** Append-only log of each step of a publishing job (never contains tokens). */
@Entity('publishing_logs')
@Index('idx_publishing_logs_job', ['jobId', 'createdAt'])
export class PublishingLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'varchar', length: 36 })
  jobId: string;

  @ManyToOne(() => PublishingJob, (j) => j.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: PublishingJob;

  @Column({ type: 'varchar', length: 10, default: 'info' })
  level: 'info' | 'warn' | 'error';

  @Column({ type: 'varchar', length: 64 })
  event: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  context: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;
}
