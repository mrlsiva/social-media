import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PublishingJobStatus, SocialPlatform } from '../../common/enums';
import { Post } from '../../posts/entities/post.entity';
import { PostPlatform } from '../../posts/entities/post-platform.entity';
import { PublishingLog } from './publishing-log.entity';

/**
 * One job per (post, platform account) per publish attempt batch.
 * e.g. "Publish to All" for 4 platforms => 4 publishing_jobs sharing a batch_id.
 */
@Entity('publishing_jobs')
@Index('idx_publishing_jobs_post', ['postId', 'createdAt'])
@Index('idx_publishing_jobs_batch', ['batchId'])
@Index('idx_publishing_jobs_status', ['status'])
export class PublishingJob extends BaseEntity {
  @Column({ name: 'batch_id', type: 'varchar', length: 36 })
  batchId: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'post_platform_id', type: 'varchar', length: 36 })
  postPlatformId: string;

  @ManyToOne(() => PostPlatform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_platform_id' })
  postPlatform: PostPlatform;

  @Column({ name: 'social_account_id', type: 'varchar', length: 36 })
  socialAccountId: string;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 20, default: PublishingJobStatus.PENDING })
  status: PublishingJobStatus;

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', unsigned: true, default: 3 })
  maxAttempts: number;

  @Column({ type: 'varchar', name: 'queue_job_id', length: 191, nullable: true })
  queueJobId: string | null;

  @Column({ name: 'scheduled_for', type: 'datetime', nullable: true })
  scheduledFor: Date | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', name: 'error_code', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'json', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ name: 'triggered_by', type: 'varchar', length: 36, nullable: true })
  triggeredBy: string | null;

  /** Id of the job this one retries (retry chain). */
  @Column({ name: 'retry_of_job_id', type: 'varchar', length: 36, nullable: true })
  retryOfJobId: string | null;

  @OneToMany(() => PublishingLog, (l) => l.job)
  logs: PublishingLog[];
}
