import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Brand } from '../../brands/entities/brand.entity';

@Entity('media_folders')
@Index('uq_media_folders_brand_parent_name', ['brandId', 'parentId', 'name'], { unique: true })
export class MediaFolder extends BaseEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'parent_id', type: 'varchar', length: 36, nullable: true })
  parentId: string | null;

  @ManyToOne(() => MediaFolder, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: MediaFolder | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;
}
