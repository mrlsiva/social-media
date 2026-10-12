import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { BrandRole } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Brand } from './brand.entity';

@Entity('brand_members')
@Index('uq_brand_members_brand_user', ['brandId', 'userId'], { unique: true })
@Index('idx_brand_members_user', ['userId'])
export class BrandMember extends BaseEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, (b) => b.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: BrandRole.EDITOR })
  role: BrandRole;
}
