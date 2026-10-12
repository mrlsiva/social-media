import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PostPlatformStatus, SocialPlatform } from '../../common/enums';
import { SocialAccount } from '../../social-accounts/entities/social-account.entity';
import { Post } from './post.entity';

/** Platform-specific publishing options (validated per publisher). */
export interface PostPlatformOptions {
  /** YouTube: public | unlisted | private */
  privacyStatus?: 'public' | 'unlisted' | 'private';
  /** YouTube category id, e.g. "22" (People & Blogs). */
  categoryId?: string;
  /** YouTube: mark as made for kids (COPPA). */
  madeForKids?: boolean;
  /** Instagram reels: also show in main feed. */
  shareToFeed?: boolean;
  /** LinkedIn: PUBLIC | CONNECTIONS */
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  [key: string]: unknown;
}

/**
 * One row per (post, destination account). Holds the platform-adapted content
 * and the latest publishing outcome so each platform can succeed/fail independently.
 */
@Entity('post_platforms')
@Index('uq_post_platforms_post_account', ['postId', 'socialAccountId'], { unique: true })
@Index('idx_post_platforms_status', ['status'])
export class PostPlatform extends BaseEntity {
  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @ManyToOne(() => Post, (p) => p.platforms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'social_account_id', type: 'varchar', length: 36 })
  socialAccountId: string;

  @ManyToOne(() => SocialAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_account_id' })
  socialAccount: SocialAccount;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 20, default: PostPlatformStatus.PENDING })
  status: PostPlatformStatus;

  /** Platform-specific caption (AI generated or user edited). Falls back to post.caption. */
  @Column({ name: 'caption_override', type: 'text', nullable: true })
  captionOverride: string | null;

  @Column({ name: 'hashtags_override', type: 'json', nullable: true })
  hashtagsOverride: string[] | null;

  @Column({ type: 'varchar', name: 'title_override', length: 255, nullable: true })
  titleOverride: string | null;

  @Column({ type: 'json', nullable: true })
  options: PostPlatformOptions | null;

  @Column({ type: 'varchar', name: 'platform_post_id', length: 255, nullable: true })
  platformPostId: string | null;

  @Column({ type: 'varchar', name: 'platform_post_url', length: 1000, nullable: true })
  platformPostUrl: string | null;

  @Column({ type: 'varchar', name: 'error_code', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts: number;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;
}
