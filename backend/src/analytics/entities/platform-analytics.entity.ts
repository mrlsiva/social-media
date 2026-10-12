import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SocialPlatform } from '../../common/enums';

/** Daily account-level metrics (followers, reach...) per connected social account. */
@Entity('platform_analytics')
@Index('uq_platform_analytics_account_date', ['socialAccountId', 'metricDate'], { unique: true })
@Index('idx_platform_analytics_brand_date', ['brandId', 'metricDate'])
export class PlatformAnalytics extends BaseEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @Column({ name: 'social_account_id', type: 'varchar', length: 36 })
  socialAccountId: string;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  @Column({ name: 'metric_date', type: 'date' })
  metricDate: string;

  @Column({ type: 'int', unsigned: true, default: 0 }) followers: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) impressions: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) reach: number;
  @Column({ name: 'profile_views', type: 'int', unsigned: true, default: 0 }) profileViews: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) engagements: number;
  @Column({ name: 'video_views', type: 'int', unsigned: true, default: 0 }) videoViews: number;
}
