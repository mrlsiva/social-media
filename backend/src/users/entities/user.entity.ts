import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { Role } from './role.entity';

@Entity('users')
export class User extends SoftDeleteEntity {
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 191 })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', name: 'password_hash', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', name: 'first_name', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', name: 'last_name', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', name: 'avatar_url', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified_at', type: 'datetime', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @ManyToMany(() => Role, { eager: false })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];
}
