import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SocialAccount } from './social-account.entity';

/** Encrypted (AES-256-GCM) OAuth credentials. Never returned by any API. */
@Entity('social_account_tokens')
export class SocialAccountToken extends BaseEntity {
  @Index('uq_social_account_tokens_account', { unique: true })
  @Column({ name: 'social_account_id', type: 'varchar', length: 36 })
  socialAccountId: string;

  @OneToOne(() => SocialAccount, (a) => a.token, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_account_id' })
  socialAccount: SocialAccount;

  @Column({ name: 'access_token_encrypted', type: 'text' })
  accessTokenEncrypted: string;

  @Column({ name: 'refresh_token_encrypted', type: 'text', nullable: true })
  refreshTokenEncrypted: string | null;

  @Column({ type: 'varchar', name: 'token_type', length: 30, default: 'Bearer' })
  tokenType: string;

  @Column({ type: 'text', nullable: true })
  scopes: string | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'refresh_expires_at', type: 'datetime', nullable: true })
  refreshExpiresAt: Date | null;

  @Column({ name: 'last_refreshed_at', type: 'datetime', nullable: true })
  lastRefreshedAt: Date | null;
}
