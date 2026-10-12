import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Brand } from '../../brands/entities/brand.entity';

/** Per-brand hashtag library with usage statistics (feeds suggestions). */
@Entity('hashtags')
@Index('uq_hashtags_brand_tag', ['brandId', 'tag'], { unique: true })
export class Hashtag extends BaseEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  /** Stored without '#', lowercase. */
  @Column({ type: 'varchar', length: 150 })
  tag: string;

  @Column({ name: 'usage_count', type: 'int', unsigned: true, default: 0 })
  usageCount: number;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt: Date | null;
}
