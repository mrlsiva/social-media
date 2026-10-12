import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Post } from '../../posts/entities/post.entity';
import { ReelMedia } from './reel-media.entity';

export interface ReelScript {
  hook: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export interface TextOverlay {
  text: string;
  startSeconds: number;
  endSeconds: number;
  position?: 'top' | 'center' | 'bottom';
}

/** Reel-specific data attached 1:1 to a post with content_type = reel. */
@Entity('reels')
export class Reel extends BaseEntity {
  @Index('uq_reels_post', { unique: true })
  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @OneToOne(() => Post, (p) => p.reel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ type: 'json', nullable: true })
  script: ReelScript | null;

  @Column({ name: 'text_overlays', type: 'json', nullable: true })
  textOverlays: TextOverlay[] | null;

  @Column({ name: 'voice_over_enabled', default: false })
  voiceOverEnabled: boolean;

  @Column({ name: 'voice_over_text', type: 'text', nullable: true })
  voiceOverText: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  voice: string | null;

  @Column({ name: 'subtitles_enabled', default: false })
  subtitlesEnabled: boolean;

  @Column({ name: 'subtitles_srt', type: 'text', nullable: true })
  subtitlesSrt: string | null;

  @Column({ type: 'varchar', name: 'music_preference', length: 100, nullable: true })
  musicPreference: string | null;

  @Column({ name: 'duration_seconds', type: 'smallint', unsigned: true, nullable: true })
  durationSeconds: number | null;

  @Column({ name: 'ai_generation_id', type: 'varchar', length: 36, nullable: true })
  aiGenerationId: string | null;

  @OneToMany(() => ReelMedia, (rm) => rm.reel, { cascade: true })
  media: ReelMedia[];
}
