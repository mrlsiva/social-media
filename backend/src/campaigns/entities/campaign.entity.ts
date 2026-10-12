import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { CampaignStatus, SocialPlatform } from '../../common/enums';
import { Brand } from '../../brands/entities/brand.entity';
import { CampaignPost } from './campaign-post.entity';

@Entity('campaigns')
@Index('idx_campaigns_brand_status', ['brandId', 'status'])
export class Campaign extends SoftDeleteEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 191 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  objective: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'duration_days', type: 'smallint', unsigned: true })
  durationDays: number;

  @Column({ type: 'json' })
  platforms: SocialPlatform[];

  @Column({ type: 'varchar', length: 20, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  /** Raw AI generated plan, kept for reference/regeneration. */
  @Column({ name: 'ai_plan', type: 'json', nullable: true })
  aiPlan: unknown;

  @OneToMany(() => CampaignPost, (cp) => cp.campaign)
  posts: CampaignPost[];
}
