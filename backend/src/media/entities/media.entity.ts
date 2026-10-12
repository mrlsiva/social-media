import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { MediaSource, MediaType } from '../../common/enums';
import { Brand } from '../../brands/entities/brand.entity';
import { MediaFolder } from './media-folder.entity';

@Entity('media')
@Index('idx_media_brand_type', ['brandId', 'type', 'createdAt'])
@Index('idx_media_brand_folder', ['brandId', 'folderId'])
export class Media extends SoftDeleteEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'folder_id', type: 'varchar', length: 36, nullable: true })
  folderId: string | null;

  @ManyToOne(() => MediaFolder, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'folder_id' })
  folder: MediaFolder | null;

  @Column({ name: 'uploaded_by', type: 'varchar', length: 36, nullable: true })
  uploadedBy: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: MediaType;

  @Column({ type: 'varchar', length: 20, default: MediaSource.UPLOAD })
  source: MediaSource;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', name: 'original_name', length: 255, nullable: true })
  originalName: string | null;

  @Exclude()
  @Column({ type: 'varchar', name: 'storage_driver', length: 20 })
  storageDriver: string;

  @Exclude()
  @Column({ type: 'varchar', name: 'storage_key', length: 500 })
  storageKey: string;

  /** Public URL (must be publicly reachable for Instagram/Facebook URL-based publishing). */
  @Column({ type: 'varchar', length: 1000 })
  url: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ type: 'varchar', length: 10 })
  extension: string;

  @Column({ name: 'size_bytes', type: 'bigint', unsigned: true, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  sizeBytes: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  width: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  height: number | null;

  @Column({ name: 'duration_seconds', type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? null : Number(v)) } })
  durationSeconds: number | null;

  @Column({ name: 'thumbnail_media_id', type: 'varchar', length: 36, nullable: true })
  thumbnailMediaId: string | null;

  @Column({ name: 'ai_generation_id', type: 'varchar', length: 36, nullable: true })
  aiGenerationId: string | null;

  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'varchar', name: 'alt_text', length: 500, nullable: true })
  altText: string | null;
}
