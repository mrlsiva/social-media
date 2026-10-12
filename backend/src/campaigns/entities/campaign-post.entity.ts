import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Post } from '../../posts/entities/post.entity';
import { Campaign } from './campaign.entity';

@Entity('campaign_posts')
@Index('uq_campaign_posts_campaign_post', ['campaignId', 'postId'], { unique: true })
export class CampaignPost extends BaseEntity {
  @Column({ name: 'campaign_id', type: 'varchar', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, (c) => c.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'day_number', type: 'smallint', unsigned: true })
  dayNumber: number;

  @Column({ type: 'varchar', length: 191, nullable: true })
  theme: string | null;
}
