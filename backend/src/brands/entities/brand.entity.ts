import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { BrandSetting } from './brand-setting.entity';
import { BrandMember } from './brand-member.entity';

@Entity('brands')
@Index('uq_brands_owner_slug', ['ownerId', 'slug'], { unique: true })
export class Brand extends SoftDeleteEntity {
  /** The account that owns the brand; its subscription plan governs limits. */
  @Column({ name: 'owner_id', type: 'varchar', length: 36 })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 170 })
  slug: string;

  @Column({ name: 'logo_media_id', type: 'varchar', length: 36, nullable: true })
  logoMediaId: string | null;

  @Column({ type: 'varchar', name: 'logo_url', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', name: 'primary_color', length: 9, default: '#0078B8' })
  primaryColor: string;

  @Column({ type: 'varchar', name: 'secondary_color', length: 9, default: '#F57AA8' })
  secondaryColor: string;

  @OneToOne(() => BrandSetting, (s) => s.brand, { cascade: true })
  settings: BrandSetting;

  @OneToMany(() => BrandMember, (m) => m.brand)
  members: BrandMember[];
}
