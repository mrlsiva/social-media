import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SocialPlatform } from '../../common/enums';

/** Daily post-level metrics per platform (synced from platform insights APIs). */
@Entity('analytics')
@Index('uq_analytics_post_platform_date', ['postPlatformId', 'metricDate'], { unique: true })
@Index('idx_analytics_brand_date', ['brandId', 'metricDate'])
@Index('idx_analytics_campaign', ['campaignId'])
export class Analytics extends BaseEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @Column({ name: 'post_platform_id', type: 'varchar', length: 36 })
  postPlatformId: string;

  @Column({ name: 'campaign_id', type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  @Column({ name: 'social_account_id', type: 'varchar', length: 36 })
  socialAccountId: string;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  @Column({ name: 'metric_date', type: 'date' })
  metricDate: string;

  @Column({ type: 'int', unsigned: true, default: 0 }) impressions: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) reach: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) likes: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) comments: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) shares: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) saves: number;
  @Column({ name: 'video_views', type: 'int', unsigned: true, default: 0 }) videoViews: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) clicks: number;
}
