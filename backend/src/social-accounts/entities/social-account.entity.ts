import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { SoftDeleteEntity } from '../../common/entities/base.entity';
import { SocialAccountStatus, SocialPlatform } from '../../common/enums';
import { Brand } from '../../brands/entities/brand.entity';
import { SocialAccountToken } from './social-account-token.entity';

/**
 * A publishing destination connected through OAuth:
 * Facebook Page, Instagram professional account, YouTube channel or LinkedIn organization/member.
 * Tokens live in social_account_tokens and are never serialized to clients.
 */
@Entity('social_accounts')
@Index('uq_social_accounts_brand_platform_account', ['brandId', 'platform', 'platformAccountId'], { unique: true })
@Index('idx_social_accounts_brand', ['brandId', 'platform'])
export class SocialAccount extends SoftDeleteEntity {
  @Column({ name: 'brand_id', type: 'varchar', length: 36 })
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ type: 'varchar', length: 32 })
  platform: SocialPlatform;

  /** Page ID / IG user ID / channel ID / LinkedIn author URN. */
  @Column({ type: 'varchar', name: 'platform_account_id', length: 191 })
  platformAccountId: string;

  /** The OAuth user that granted access (FB user ID, Google sub, LinkedIn member ID). */
  @Column({ type: 'varchar', name: 'platform_user_id', length: 191, nullable: true })
  platformUserId: string | null;

  @Column({ type: 'varchar', name: 'account_name', length: 255 })
  accountName: string;

  /** page | instagram_business | channel | organization | person */
  @Column({ type: 'varchar', name: 'account_type', length: 50 })
  accountType: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', name: 'profile_image_url', length: 1000, nullable: true })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: SocialAccountStatus.CONNECTED })
  status: SocialAccountStatus;

  @Column({ type: 'varchar', name: 'status_message', length: 500, nullable: true })
  statusMessage: string | null;

  @Column({ name: 'connected_by', type: 'varchar', length: 36, nullable: true })
  connectedBy: string | null;

  @Column({ name: 'last_synced_at', type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;

  /** Non-secret provider data (e.g. linked FB page id for Instagram). */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @OneToOne(() => SocialAccountToken, (t) => t.socialAccount)
  token?: SocialAccountToken;
}
