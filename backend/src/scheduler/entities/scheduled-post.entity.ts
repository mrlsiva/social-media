import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ScheduledPostStatus } from '../../common/enums';
import { Post } from '../../posts/entities/post.entity';

/**
 * Durable record of a scheduled publish. The BullMQ delayed job is the trigger;
 * this row is the source of truth (and lets the sweeper recover jobs lost from Redis).
 */
@Entity('scheduled_posts')
@Index('idx_scheduled_posts_status_time', ['status', 'scheduledAt'])
@Index('idx_scheduled_posts_brand', ['brandId', 'scheduledAt'])
export class ScheduledPost extends BaseEntity {
  @Index('uq_scheduled_posts_post', { unique: true })
  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @OneToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @Column({ name: 'scheduled_at', type: 'datetime' })
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'varchar', length: 20, default: ScheduledPostStatus.PENDING })
  status: ScheduledPostStatus;

  @Column({ type: 'varchar', name: 'queue_job_id', length: 191, nullable: true })
  queueJobId: string | null;

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;
}
