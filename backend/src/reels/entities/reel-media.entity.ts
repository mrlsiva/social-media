import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Media } from '../../media/entities/media.entity';
import { Reel } from './reel.entity';

export type ReelMediaRole = 'clip' | 'voice_over' | 'music' | 'thumbnail' | 'final';

@Entity('reel_media')
@Index('uq_reel_media_reel_media_role', ['reelId', 'mediaId', 'role'], { unique: true })
export class ReelMedia extends BaseEntity {
  @Column({ name: 'reel_id', type: 'varchar', length: 36 })
  reelId: string;

  @ManyToOne(() => Reel, (r) => r.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reel_id' })
  reel: Reel;

  @Column({ name: 'media_id', type: 'varchar', length: 36 })
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'media_id' })
  media: Media;

  @Column({ type: 'varchar', length: 20, default: 'clip' })
  role: ReelMediaRole;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  position: number;
}
