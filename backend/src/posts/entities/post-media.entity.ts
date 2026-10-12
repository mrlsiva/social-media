import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Media } from '../../media/entities/media.entity';
import { Post } from './post.entity';

@Entity('post_media')
@Index('uq_post_media_post_media', ['postId', 'mediaId'], { unique: true })
export class PostMedia extends BaseEntity {
  @Column({ name: 'post_id', type: 'varchar', length: 36 })
  postId: string;

  @ManyToOne(() => Post, (p) => p.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'media_id', type: 'varchar', length: 36 })
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'media_id' })
  media: Media;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  position: number;
}
