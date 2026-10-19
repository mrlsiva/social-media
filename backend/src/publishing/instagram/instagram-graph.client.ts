import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addSeconds } from '../../common/utils/duration';
import type { SocialConfig } from '../../config/configuration';
import { MetaGraphClient } from '../meta/meta-graph.client';

/**
 * Graph API client for "Instagram API with Instagram Login" (graph.instagram.com), used when a
 * separate Instagram app is configured (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET). No Facebook Page needed.
 * Same request/error handling as MetaGraphClient; tokens are long-lived (~60 day) and refreshable.
 */
@Injectable()
export class InstagramGraphClient extends MetaGraphClient {
  private readonly ig: SocialConfig['instagram'];

  constructor(config: ConfigService) {
    super(config);
    const ig = config.getOrThrow<SocialConfig>('social').instagram;
    this.ig = {
      ...ig,
      redirectUri: ig.redirectUri || `${config.getOrThrow<string>('app.url')}/api/v1/social-accounts/instagram/callback`,
    };
  }

  override get graphUrl(): string {
    return `https://graph.instagram.com/${this.cfg.graphVersion}`;
  }

  override get graphVideoUrl(): string {
    return this.graphUrl;
  }

  get redirectUri(): string {
    return this.ig.redirectUri;
  }

  override isConfigured(): boolean {
    return !!(this.ig.appId && this.ig.appSecret);
  }

  override authorizationUrl(scopes: string[], state: string): string {
    const params = new URLSearchParams({
      client_id: this.ig.appId,
      redirect_uri: this.ig.redirectUri,
      state,
      response_type: 'code',
      scope: scopes.join(','),
    });
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  /** code -> short-lived token (api.instagram.com) -> long-lived (~60 day) token. */
  override async exchangeCodeForLongLivedToken(code: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    type ShortToken = { access_token: string; user_id?: string | number };
    const form = new URLSearchParams({
      client_id: this.ig.appId,
      client_secret: this.ig.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.ig.redirectUri,
      code,
    });
    const res = await this.call(() =>
      this.http.post<ShortToken | { data: ShortToken[] }>('https://api.instagram.com/oauth/access_token', form).then((r) => r.data),
    );
    const short = 'data' in res ? res.data[0] : res;
    const long = await this.call(() =>
      this.http
        .get<{ access_token: string; expires_in?: number }>('https://graph.instagram.com/access_token', {
          params: { grant_type: 'ig_exchange_token', client_secret: this.ig.appSecret, access_token: short.access_token },
        })
        .then((r) => r.data),
    );
    return { accessToken: long.access_token, expiresAt: long.expires_in ? addSeconds(new Date(), long.expires_in) : null };
  }

  /** Extends a long-lived token for another ~60 days (the token must be at least 24 h old). */
  async refreshLongLivedToken(token: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    const res = await this.call(() =>
      this.http
        .get<{ access_token: string; expires_in?: number }>('https://graph.instagram.com/refresh_access_token', {
          params: { grant_type: 'ig_refresh_token', access_token: token },
        })
        .then((r) => r.data),
    );
    return { accessToken: res.access_token, expiresAt: res.expires_in ? addSeconds(new Date(), res.expires_in) : null };
  }

  /** graph.instagram.com does not use appsecret_proof. */
  protected override authParams(token?: string): Record<string, string> {
    return token ? { access_token: token } : {};
  }
}
