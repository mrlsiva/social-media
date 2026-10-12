import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SocialPlatform } from '../../common/enums';

/**
 * Single-use OAuth state (CSRF protection) plus the encrypted result of the
 * token exchange, which the user then uses to pick which pages/channels to connect.
 */
@Entity('oauth_states')
export class OAuthState extends BaseEntity {
  @Index('uq_oauth_states_hash', { unique: true })
  @Column({ type: 'varchar', name: 'state_hash', length: 64 })
  stateHash: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  /** PKCE verifier (encrypted) for providers that support it. */
  @Column({ name: 'code_verifier_encrypted', type: 'text', nullable: true })
  codeVerifierEncrypted: string | null;

  /** Where to send the browser after the callback (web app URL or mobile deep link). */
  @Column({ type: 'varchar', name: 'return_url', length: 500, nullable: true })
  returnUrl: string | null;

  /** Encrypted JSON of discovered accounts + tokens awaiting user selection. */
  @Column({ name: 'result_encrypted', type: 'longtext', nullable: true })
  resultEncrypted: string | null;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;
}
