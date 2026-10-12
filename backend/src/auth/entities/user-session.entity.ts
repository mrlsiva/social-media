import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ClientPlatform } from '../../common/enums';
import { User } from '../../users/entities/user.entity';

/**
 * One row per logged-in device. Holds the hash of the current refresh token
 * (rotated on every refresh) so devices can be listed and revoked individually.
 */
@Entity('user_sessions')
@Index('idx_user_sessions_user', ['userId', 'revokedAt'])
export class UserSession extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('uq_user_sessions_token', { unique: true })
  @Column({ type: 'varchar', name: 'refresh_token_hash', length: 64, select: false })
  refreshTokenHash: string;

  /** Previous token hash; reuse of a rotated token revokes the session (theft detection). */
  @Column({ type: 'varchar', name: 'previous_token_hash', length: 64, nullable: true, select: false })
  previousTokenHash: string | null;

  @Column({ type: 'varchar', name: 'device_id', length: 191, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', name: 'device_name', length: 191, nullable: true })
  deviceName: string | null;

  @Column({ type: 'varchar', length: 20, default: ClientPlatform.WEB })
  platform: ClientPlatform;

  @Column({ type: 'varchar', name: 'push_token', length: 500, nullable: true, select: false })
  pushToken: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', name: 'ip_address', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;
}
