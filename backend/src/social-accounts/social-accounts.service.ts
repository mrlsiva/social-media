import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BrandAccessService } from '../brands/brand-access.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException, ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BrandRole, SocialAccountStatus, SocialPlatform, UsageMetric } from '../common/enums';
import { addSeconds } from '../common/utils/duration';
import { DiscoveredAccount } from '../publishing/interfaces/social-publisher.interface';
import { PublisherRegistry } from '../publishing/publisher.registry';
import { SocialConfig } from '../config/configuration';
import { UsageService } from '../subscriptions/usage.service';
import { CallbackQueryDto, ConnectSocialAccountDto, SocialAccountQueryDto, SocialAccountResponseDto } from './dto/social-account.dto';
import { OAuthState } from './entities/oauth-state.entity';
import { SocialAccount } from './entities/social-account.entity';
import { SocialAccountToken } from './entities/social-account-token.entity';
import { TokenService } from './token.service';

const STATE_TTL_SECONDS = 15 * 60;

const accountKey = (a: Pick<DiscoveredAccount, 'platform' | 'platformAccountId'>) =>
  createHash('sha256').update(`${a.platform}:${a.platformAccountId}`).digest('hex').slice(0, 24);

@Injectable()
export class SocialAccountsService {
  private readonly logger = new Logger(SocialAccountsService.name);
  private readonly webAppUrl: string;
  private readonly allowedReturnPrefixes: string[];
  /** OAuth callback URL per platform, shown in the UI setup guide so admins can register it with the provider. */
  private readonly redirectUris: Partial<Record<SocialPlatform, string>>;

  constructor(
    @InjectRepository(SocialAccount) private readonly accounts: Repository<SocialAccount>,
    @InjectRepository(SocialAccountToken) private readonly tokenRows: Repository<SocialAccountToken>,
    @InjectRepository(OAuthState) private readonly states: Repository<OAuthState>,
    private readonly registry: PublisherRegistry,
    private readonly tokens: TokenService,
    private readonly encryption: EncryptionService,
    private readonly access: BrandAccessService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.webAppUrl = config.getOrThrow<string>('app.webAppUrl');
    this.allowedReturnPrefixes = [
      this.webAppUrl,
      ...(config.get<string>('OAUTH_ALLOWED_RETURN_URLS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ];
    const social = config.getOrThrow<SocialConfig>('social');
    const callback = (platform: string, configured: string) =>
      configured || `${config.getOrThrow<string>('app.url')}/api/v1/social-accounts/${platform}/callback`;
    const meta = callback(SocialPlatform.FACEBOOK, social.meta.redirectUri);
    this.redirectUris = {
      [SocialPlatform.FACEBOOK]: meta,
      [SocialPlatform.INSTAGRAM]: social.instagram.appId && social.instagram.appSecret ? callback(SocialPlatform.INSTAGRAM, social.instagram.redirectUri) : meta,
      [SocialPlatform.YOUTUBE]: callback(SocialPlatform.YOUTUBE, social.google.redirectUri),
      [SocialPlatform.LINKEDIN]: callback(SocialPlatform.LINKEDIN, social.linkedin.redirectUri),
    };
  }

  platforms() {
    return this.registry.describe().map((p) => ({ ...p, redirectUri: this.redirectUris[p.platform] ?? null }));
  }

  async list(userId: string, query: SocialAccountQueryDto): Promise<PaginatedResult<SocialAccountResponseDto>> {
    const brandIds = query.brandId ? [query.brandId] : await this.access.accessibleBrandIds(userId);
    if (query.brandId) await this.access.assert(userId, query.brandId);
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);

    const [rows, total] = await this.accounts.findAndCount({
      where: {
        brandId: In(brandIds),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { platform: 'ASC', accountName: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    const expiries = await this.tokenExpiries(rows.map((r) => r.id));
    return new PaginatedResult(rows.map((r) => this.toResponse(r, expiries.get(r.id) ?? null)), total, query.page, query.limit);
  }

  async get(userId: string, id: string): Promise<SocialAccount> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw AppException.notFound(ErrorCode.SOCIAL_ACCOUNT_NOT_CONNECTED, 'Social account not found');
    await this.access.assert(userId, account.brandId).catch(() => {
      throw AppException.notFound(ErrorCode.SOCIAL_ACCOUNT_NOT_CONNECTED, 'Social account not found');
    });
    return account;
  }

  // ---------------------------------------------------------------- OAuth

  /** Step 1: create a single-use state (+ PKCE) and return the provider authorization URL. */
  async connect(userId: string, platform: SocialPlatform, dto: ConnectSocialAccountDto) {
    await this.access.assert(userId, dto.brandId, BrandRole.ADMIN);
    const publisher = this.registry.getConfigured(platform);
    const returnUrl = this.validateReturnUrl(dto.returnUrl);

    const state = randomBytes(32).toString('base64url');
    const codeVerifier = publisher.usesPkce ? randomBytes(48).toString('base64url') : undefined;
    const codeChallenge = codeVerifier ? createHash('sha256').update(codeVerifier).digest('base64url') : undefined;
    const expiresAt = addSeconds(new Date(), STATE_TTL_SECONDS);

    await this.states.save(
      this.states.create({
        stateHash: EncryptionService.sha256(state),
        userId,
        brandId: dto.brandId,
        platform,
        codeVerifierEncrypted: codeVerifier ? this.encryption.encrypt(codeVerifier) : null,
        returnUrl,
        expiresAt,
      }),
    );
    await this.audit.log({ action: 'oauth.start', userId, brandId: dto.brandId, metadata: { platform } });
    return { authorizationUrl: publisher.connect({ state, codeChallenge }), expiresAt };
  }

  /**
   * Step 2 (public, browser redirect): validates state, exchanges the code and stores the
   * discovered accounts (encrypted) for the user to pick from. Returns the redirect URL.
   */
  async handleCallback(query: CallbackQueryDto): Promise<string> {
    const fallback = `${this.webAppUrl}/social-accounts/callback`;
    if (!query.state) return this.redirect(fallback, { status: 'error', error: ErrorCode.OAUTH_STATE_INVALID });

    const stateRow = await this.states.findOne({ where: { stateHash: EncryptionService.sha256(query.state) } });
    if (!stateRow || stateRow.usedAt || stateRow.expiresAt < new Date()) {
      return this.redirect(stateRow?.returnUrl ?? fallback, { status: 'error', error: ErrorCode.OAUTH_STATE_INVALID, message: 'Connection link expired. Please try again.' });
    }
    // Single use: burn the state before doing anything else.
    await this.states.update({ id: stateRow.id }, { usedAt: new Date() });
    const returnUrl = stateRow.returnUrl ?? fallback;

    if (query.error || !query.code) {
      await this.audit.log({ action: 'oauth.denied', userId: stateRow.userId, brandId: stateRow.brandId, metadata: { platform: stateRow.platform, error: query.error } });
      return this.redirect(returnUrl, { status: 'error', error: ErrorCode.OAUTH_FAILED, platform: stateRow.platform, message: query.error_description ?? 'Authorization was cancelled' });
    }

    try {
      const publisher = this.registry.getConfigured(stateRow.platform);
      const discovered = await publisher.completeConnection({
        code: query.code,
        codeVerifier: stateRow.codeVerifierEncrypted ? this.encryption.decrypt(stateRow.codeVerifierEncrypted) : undefined,
      });
      await this.states.update(
        { id: stateRow.id },
        { resultEncrypted: this.encryption.encrypt(JSON.stringify(discovered)), expiresAt: addSeconds(new Date(), STATE_TTL_SECONDS) },
      );
      await this.audit.log({ action: 'oauth.callback', userId: stateRow.userId, brandId: stateRow.brandId, metadata: { platform: stateRow.platform, accounts: discovered.length } });
      return this.redirect(returnUrl, { status: 'success', session: stateRow.id, platform: stateRow.platform, count: String(discovered.length) });
    } catch (err) {
      this.logger.warn({ platform: stateRow.platform, err: (err as Error).message }, 'OAuth code exchange failed');
      await this.audit.log({ action: 'oauth.failed', userId: stateRow.userId, brandId: stateRow.brandId, metadata: { platform: stateRow.platform } });
      return this.redirect(returnUrl, { status: 'error', error: ErrorCode.OAUTH_FAILED, platform: stateRow.platform, message: 'Could not complete the connection with the platform' });
    }
  }

  /** Step 3: list discovered accounts (no tokens) for selection. */
  async getSession(userId: string, sessionId: string) {
    const { row, discovered } = await this.loadSession(userId, sessionId);
    const existing = await this.accounts.find({ where: { brandId: row.brandId, platform: row.platform } });
    const connected = new Set(existing.map((e) => e.platformAccountId));
    return {
      sessionId: row.id,
      brandId: row.brandId,
      platform: row.platform,
      expiresAt: row.expiresAt,
      accounts: discovered.map((d) => ({
        key: accountKey(d),
        platformAccountId: d.platformAccountId,
        accountName: d.accountName,
        accountType: d.accountType,
        username: d.username ?? null,
        profileImageUrl: d.profileImageUrl ?? null,
        alreadyConnected: connected.has(d.platformAccountId),
      })),
    };
  }

  /** Step 4: persist the selected accounts with encrypted tokens. */
  async completeSession(userId: string, sessionId: string, accountKeys: string[]): Promise<SocialAccountResponseDto[]> {
    const { row, discovered } = await this.loadSession(userId, sessionId);
    const { brand } = await this.access.assert(userId, row.brandId, BrandRole.ADMIN);
    const selected = discovered.filter((d) => accountKeys.includes(accountKey(d)));
    if (selected.length === 0) throw new AppException(ErrorCode.VALIDATION_FAILED, 'Select at least one account to connect');

    const existing = await this.accounts.find({ where: { brandId: row.brandId, platform: row.platform }, withDeleted: true });
    const newCount = selected.filter((s) => !existing.some((e) => e.platformAccountId === s.platformAccountId && !e.deletedAt)).length;
    if (newCount > 0) await this.usage.assertWithinLimit(brand.ownerId, UsageMetric.SOCIAL_ACCOUNTS, newCount);

    const saved: SocialAccount[] = [];
    for (const item of selected) {
      const current = existing.find((e) => e.platformAccountId === item.platformAccountId);
      if (current?.deletedAt) await this.accounts.restore({ id: current.id });
      const account = await this.accounts.save(
        this.accounts.merge(current ?? this.accounts.create({ brandId: row.brandId, platform: item.platform, platformAccountId: item.platformAccountId }), {
          platformUserId: item.platformUserId,
          accountName: item.accountName.slice(0, 255),
          accountType: item.accountType,
          username: item.username ?? null,
          profileImageUrl: item.profileImageUrl ?? null,
          status: SocialAccountStatus.CONNECTED,
          statusMessage: null,
          connectedBy: userId,
          metadata: item.metadata ?? null,
          deletedAt: null,
        }),
      );
      await this.tokens.save(account.id, {
        ...item.credentials,
        expiresAt: item.credentials.expiresAt ? new Date(item.credentials.expiresAt) : null,
        refreshExpiresAt: item.credentials.refreshExpiresAt ? new Date(item.credentials.refreshExpiresAt) : null,
      });
      saved.push(account);
      await this.audit.log({ action: 'social_account.connect', userId, brandId: row.brandId, entityType: 'social_account', entityId: account.id, metadata: { platform: item.platform } });
    }

    await this.states.update({ id: row.id }, { completedAt: new Date(), resultEncrypted: null });
    const expiries = await this.tokenExpiries(saved.map((s) => s.id));
    return saved.map((s) => this.toResponse(s, expiries.get(s.id) ?? null));
  }

  async disconnect(userId: string, id: string): Promise<void> {
    const account = await this.get(userId, id);
    await this.access.assert(userId, account.brandId, BrandRole.ADMIN);
    const publisher = this.registry.get(account.platform);
    if (publisher.revoke) {
      try {
        await publisher.revoke(await this.tokens.get(account.id));
      } catch (err) {
        this.logger.warn({ accountId: id, err: (err as Error).message }, 'Provider token revoke failed (continuing)');
      }
    }
    // Tokens are deleted immediately; the account row is soft-deleted to keep publishing history.
    await this.tokenRows.delete({ socialAccountId: id });
    await this.accounts.update({ id }, { status: SocialAccountStatus.REVOKED });
    await this.accounts.softDelete({ id });
    await this.audit.log({ action: 'social_account.disconnect', userId, brandId: account.brandId, entityType: 'social_account', entityId: id, metadata: { platform: account.platform } });
  }

  async validate(userId: string, id: string): Promise<SocialAccountResponseDto> {
    const account = await this.get(userId, id);
    const publisher = this.registry.getConfigured(account.platform);
    let credentials;
    try {
      credentials = await this.tokens.getValid(account);
    } catch (err) {
      if (err instanceof AppException && err.code === ErrorCode.TOKEN_EXPIRED) return this.reload(account.id);
      throw err;
    }
    const result = await publisher.validateAccount(account, credentials);
    if (result.valid) {
      await this.accounts.update(
        { id },
        {
          status: SocialAccountStatus.CONNECTED,
          statusMessage: null,
          lastSyncedAt: new Date(),
          ...(result.accountName ? { accountName: result.accountName } : {}),
          ...(result.profileImageUrl !== undefined ? { profileImageUrl: result.profileImageUrl } : {}),
        },
      );
    } else if (result.tokenExpired) {
      await this.tokens.markExpired(account, result.message ?? 'Access was revoked or expired');
    } else {
      await this.accounts.update({ id }, { status: SocialAccountStatus.ERROR, statusMessage: (result.message ?? 'Validation failed').slice(0, 500) });
    }
    return this.reload(id);
  }

  async refreshToken(userId: string, id: string): Promise<SocialAccountResponseDto> {
    const account = await this.get(userId, id);
    await this.access.assert(userId, account.brandId, BrandRole.ADMIN);
    const refreshed = await this.tokens.refresh(account);
    if (!refreshed) {
      throw new ProviderError(
        'This platform does not allow refreshing this token automatically. Reconnect the account if it has expired.',
        ErrorCode.TOKEN_EXPIRED,
      );
    }
    return this.reload(id);
  }

  // ---------------------------------------------------------------- helpers

  private async loadSession(userId: string, sessionId: string): Promise<{ row: OAuthState; discovered: DiscoveredAccount[] }> {
    const row = await this.states.findOne({ where: { id: sessionId, userId } });
    if (!row || !row.resultEncrypted || row.completedAt || row.expiresAt < new Date()) {
      throw AppException.notFound(ErrorCode.OAUTH_STATE_INVALID, 'Connection session not found or expired. Start the connection again.');
    }
    return { row, discovered: JSON.parse(this.encryption.decrypt(row.resultEncrypted)) as DiscoveredAccount[] };
  }

  private validateReturnUrl(url?: string): string {
    if (!url) return `${this.webAppUrl}/social-accounts/callback`;
    if (!this.allowedReturnPrefixes.some((prefix) => url.startsWith(prefix))) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'returnUrl is not an allowed redirect target');
    }
    return url;
  }

  private redirect(base: string, params: Record<string, string | undefined>): string {
    const url = new URL(base);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    return url.toString();
  }

  private async tokenExpiries(ids: string[]): Promise<Map<string, Date | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.tokenRows.find({ where: { socialAccountId: In(ids) }, select: { socialAccountId: true, expiresAt: true } });
    return new Map(rows.map((r) => [r.socialAccountId, r.expiresAt]));
  }

  private async reload(id: string): Promise<SocialAccountResponseDto> {
    const account = await this.accounts.findOneOrFail({ where: { id } });
    const expiries = await this.tokenExpiries([id]);
    return this.toResponse(account, expiries.get(id) ?? null);
  }

  toResponse(a: SocialAccount, tokenExpiresAt: Date | null): SocialAccountResponseDto {
    return {
      id: a.id,
      brandId: a.brandId,
      platform: a.platform,
      platformAccountId: a.platformAccountId,
      accountName: a.accountName,
      accountType: a.accountType,
      username: a.username,
      profileImageUrl: a.profileImageUrl,
      status: a.status,
      statusMessage: a.statusMessage,
      tokenExpiresAt,
      lastSyncedAt: a.lastSyncedAt,
      createdAt: a.createdAt,
    };
  }
}
