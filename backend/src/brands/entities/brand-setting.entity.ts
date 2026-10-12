import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Brand } from './brand.entity';

export interface BrandAiSettings {
  /** Free-form description of the brand voice used in every AI prompt. */
  brandVoice?: string;
  /** Words/phrases that should appear where relevant. */
  keywords?: string[];
  /** Words/phrases the AI must avoid. */
  avoidWords?: string[];
  /** Use brand logo/colours/name in generated images by default. */
  useBrandingInImages?: boolean;
  /** Emoji usage preference. */
  emojiLevel?: 'none' | 'light' | 'heavy';
}

@Entity('brand_settings')
export class BrandSetting extends BaseEntity {
  @Index('uq_brand_settings_brand', { unique: true })
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @OneToOne(() => Brand, (b) => b.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ type: 'varchar', name: 'default_language', length: 10, default: 'en' })
  defaultLanguage: string;

  @Column({ type: 'varchar', name: 'default_tone', length: 50, default: 'professional' })
  defaultTone: string;

  @Column({ type: 'varchar', name: 'default_cta', length: 255, nullable: true })
  defaultCta: string | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ name: 'default_hashtags', type: 'json', nullable: true })
  defaultHashtags: string[] | null;

  @Column({ name: 'ai_settings', type: 'json', nullable: true })
  aiSettings: BrandAiSettings | null;
}
