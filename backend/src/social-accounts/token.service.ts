import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType, SocialAccountStatus } from '../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { OAuthCredentials } from '../publishing/interfaces/social-publisher.interface';
import { PublisherRegistry } from '../publishing/publisher.registry';
import { PLATFORM_NAMES } from '../publishing/base.publisher';
import { BrandMember } from '../brands/entities/brand-member.entity';
import { BrandRole } from '../common/enums';
import { SocialAccount } from './entities/social-account.entity';
import { SocialAccountToken } from './entities/social-account-token.entity';

/** Refresh access tokens this long before they expire. */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * The only place that decrypts social tokens. Tokens never leave the backend.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(SocialAccountToken) private readonly tokens: Repository<SocialAccountToken>,
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    @InjectRepository(BrandMember) private readonly members: Repository<BrandMember>,
    private readonly encryption: EncryptionService,
    private readonly registry: PublisherRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  async save(socialAccountId: string, credentials: OAuthCredentials): Promise<void> {
    const existing = await this.tokens.findOne({ where: { socialAccountId } });
    const row = this.tokens.merge(existing ?? this.tokens.create({ socialAccountId }), {
      accessTokenEncrypted: this.encryption.encrypt(credentials.accessToken),
      refreshTokenEncrypted: credentials.refreshToken ? this.encryption.encrypt(credentials.refreshToken) : existing?.refreshTokenEncrypted ?? null,
      expiresAt: credentials.expiresAt ?? null,
      refreshExpiresAt: credentials.refreshExpiresAt ?? existing?.refreshExpiresAt ?? null,
      scopes: credentials.scopes ?? existing?.scopes ?? null,
      lastRefreshedAt: existing ? new Date() : null,
    });
    await this.tokens.save(row);
  }

  async get(socialAccountId: string): Promise<OAuthCredentials> {
    const row = await this.tokens.findOne({ where: { socialAccountId } });
    if (!row) throw new AppException(ErrorCode.SOCIAL_ACCOUNT_NOT_CONNECTED, 'Social account has no stored credentials. Please reconnect.');
    return {
      accessToken: this.encryption.decrypt(row.accessTokenEncrypted),
      refreshToken: row.refreshTokenEncrypted ? this.encryption.decrypt(row.refreshTokenEncrypted) : null,
      expiresAt: row.expiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      scopes: row.scopes,
    };
  }

  /** Returns usable credentials, refreshing them when they are about to expire. */
  async getValid(account: SocialAccount): Promise<OAuthCredentials> {
    const credentials = await this.get(account.id);
    if (!credentials.expiresAt || credentials.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return credentials;
    const refreshed = await this.refresh(account, credentials);
    if (refreshed) return refreshed;
    if (credentials.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(account, 'Access token expired and cannot be refreshed automatically');
      throw new AppException(ErrorCode.TOKEN_EXPIRED, `${PLATFORM_NAMES[account.platform]} connection expired. Please reconnect the account.`, 401);
    }
    return credentials;
  }

  /** Refreshes via the provider; returns null when the provider cannot refresh. */
  async refresh(account: SocialAccount, current?: OAuthCredentials): Promise<OAuthCredentials | null> {
    const credentials = current ?? (await this.get(account.id));
    const publisher = this.registry.get(account.platform);
    try {
      const refreshed = await publisher.refreshToken(account, credentials);
      if (!refreshed) return null;
      await this.save(account.id, refreshed);
      if (account.status !== SocialAccountStatus.CONNECTED) {
        await this.accounts.update({ id: account.id }, { status: SocialAccountStatus.CONNECTED, statusMessage: null });
      }
      this.logger.log({ accountId: account.id, platform: account.platform }, 'OAuth token refreshed');
      return refreshed;
    } catch (err) {
      this.logger.warn({ accountId: account.id, platform: account.platform, err: (err as Error).message }, 'OAuth token refresh failed');
      return null;
    }
  }

  /** Flags the account and notifies brand admins so they can reconnect. */
  async markExpired(account: SocialAccount, message: string): Promise<void> {
    if (account.status === SocialAccountStatus.EXPIRED) return;
    await this.accounts.update({ id: account.id }, { status: SocialAccountStatus.EXPIRED, statusMessage: message.slice(0, 500) });
    account.status = SocialAccountStatus.EXPIRED;
    const admins = await this.members
      .createQueryBuilder('m')
      .where('m.brand_id = :brandId', { brandId: account.brandId })
      .andWhere('m.role IN (:...roles)', { roles: [BrandRole.OWNER, BrandRole.ADMIN] })
      .getMany();
    for (const admin of admins) {
      await this.notifications.notify({
        userId: admin.userId,
        brandId: account.brandId,
        type: NotificationType.TOKEN_EXPIRED,
        title: `${PLATFORM_NAMES[account.platform]} connection expired`,
        body: `Reconnect "${account.accountName}" to keep publishing.`,
        data: { socialAccountId: account.id, platform: account.platform },
      });
    }
  }
}
