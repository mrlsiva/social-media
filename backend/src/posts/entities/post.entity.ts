import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { ContentType, PostStatus } from '../../common/enums';
import { Brand } from '../../brands/entities/brand.entity';
import { PostMedia } from './post-media.entity';
import { PostPlatform } from './post-platform.entity';
import { Reel } from '../../reels/entities/reel.entity';

@Entity('posts')
@Index('idx_posts_brand_status', ['brandId', 'status'])
@Index('idx_posts_brand_scheduled', ['brandId', 'scheduledAt'])
@Index('idx_posts_campaign', ['campaignId'])
export class Post extends SoftDeleteEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'campaign_id', type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'content_type', type: 'varchar', length: 20 })
  contentType: ContentType;

  @Column({ type: 'text', nullable: true })
  caption: string | null;

  @Column({ type: 'json', nullable: true })
  hashtags: string[] | null;

  @Column({ type: 'json', nullable: true })
  mentions: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cta: string | null;

  @Column({ type: 'varchar', name: 'link_url', length: 1000, nullable: true })
  linkUrl: string | null;

  /** YouTube / long video specific. */
  @Column({ type: 'varchar', name: 'video_title', length: 255, nullable: true })
  videoTitle: string | null;

  @Column({ name: 'video_description', type: 'text', nullable: true })
  videoDescription: string | null;

  @Column({ name: 'thumbnail_media_id', type: 'varchar', length: 36, nullable: true })
  thumbnailMediaId: string | null;

  @Column({ type: 'varchar', length: 30, default: PostStatus.DRAFT })
  status: PostStatus;

  @Column({ name: 'scheduled_at', type: 'datetime', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @OneToMany(() => PostMedia, (pm) => pm.post, { cascade: true })
  media: PostMedia[];

  @OneToMany(() => PostPlatform, (pp) => pp.post, { cascade: true })
  platforms: PostPlatform[];

  @OneToOne(() => Reel, (r) => r.post)
  reel?: Reel;
}
