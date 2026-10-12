import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { ProviderError } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { addSeconds } from '../../common/utils/duration';
import type { SocialConfig } from '../../config/configuration';

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string };
}

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  username?: string;
  category?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}

// Meta rate-limit / throttling error codes.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004]);

/**
 * Shared Graph API client for Facebook Pages and Instagram (Instagram API with Facebook Login).
 * Every call carries appsecret_proof (HMAC of the token with the app secret).
 */
@Injectable()
export class MetaGraphClient {
  private readonly cfg: SocialConfig['meta'];
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.cfg = config.getOrThrow<SocialConfig>('social').meta;
    this.http = axios.create({ timeout: 120_000 });
  }

  get version(): string {
    return this.cfg.graphVersion;
  }

  get graphUrl(): string {
    return `https://graph.facebook.com/${this.cfg.graphVersion}`;
  }

  get graphVideoUrl(): string {
    return `https://graph-video.facebook.com/${this.cfg.graphVersion}`;
  }

  isConfigured(): boolean {
    return !!(this.cfg.appId && this.cfg.appSecret && this.cfg.redirectUri);
  }

  authorizationUrl(scopes: string[], state: string): string {
    const params = new URLSearchParams({
      client_id: this.cfg.appId,
      redirect_uri: this.cfg.redirectUri,
      state,
      response_type: 'code',
      scope: scopes.join(','),
    });
    return `https://www.facebook.com/${this.cfg.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  /** code -> short-lived user token -> long-lived (~60 day) user token. */
  async exchangeCodeForLongLivedToken(code: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    const short = await this.get<{ access_token: string }>('/oauth/access_token', {
      client_id: this.cfg.appId,
      client_secret: this.cfg.appSecret,
      redirect_uri: this.cfg.redirectUri,
      code,
    });
    const long = await this.get<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: this.cfg.appId,
      client_secret: this.cfg.appSecret,
      fb_exchange_token: short.access_token,
    });
    return { accessToken: long.access_token, expiresAt: long.expires_in ? addSeconds(new Date(), long.expires_in) : null };
  }

  /**
   * Pages the user manages. Page tokens obtained with a long-lived user token do not expire.
   */
  async listPages(userToken: string, fields: string): Promise<MetaPage[]> {
    const pages: MetaPage[] = [];
    let after: string | undefined;
    do {
      const res = await this.get<{ data: MetaPage[]; paging?: { cursors?: { after?: string }; next?: string } }>(
        '/me/accounts',
        { fields, limit: 100, ...(after ? { after } : {}) },
        userToken,
      );
      pages.push(...res.data);
      after = res.paging?.next ? res.paging.cursors?.after : undefined;
    } while (after);
    return pages;
  }

  async get<T>(path: string, params: Record<string, unknown> = {}, token?: string): Promise<T> {
    return this.call<T>(() =>
      this.http.get<T>(`${this.graphUrl}${path}`, { params: { ...params, ...this.authParams(token) } }).then((r) => r.data),
    );
  }

  async post<T>(path: string, data: Record<string, unknown>, token: string, opts: { video?: boolean } = {}): Promise<T> {
    const base = opts.video ? this.graphVideoUrl : this.graphUrl;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...data, ...this.authParams(token) })) {
      if (v === undefined || v === null) continue;
      body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return this.call<T>(() => this.http.post<T>(`${base}${path}`, body).then((r) => r.data));
  }

  async postMultipart<T>(path: string, form: FormData, token: string, opts: { video?: boolean } = {}): Promise<T> {
    const base = opts.video ? this.graphVideoUrl : this.graphUrl;
    for (const [k, v] of Object.entries(this.authParams(token))) form.append(k, v);
    return this.call<T>(() => this.http.post<T>(`${base}${path}`, form, { maxBodyLength: Infinity, maxContentLength: Infinity }).then((r) => r.data));
  }

  /** Binary upload to rupload.facebook.com (Reels / Instagram resumable uploads). */
  async ruploadBinary<T>(url: string, token: string, blob: Blob): Promise<T> {
    return this.call<T>(() =>
      this.http
        .post<T>(url, blob, {
          headers: {
            Authorization: `OAuth ${token}`,
            offset: '0',
            file_size: String(blob.size),
            'Content-Type': 'application/octet-stream',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 30 * 60_000,
        })
        .then((r) => r.data),
    );
  }

  private authParams(token?: string): Record<string, string> {
    if (!token) return {};
    return {
      access_token: token,
      appsecret_proof: createHmac('sha256', this.cfg.appSecret).update(token).digest('hex'),
    };
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.toError(err);
    }
  }

  private toError(err: unknown): ProviderError {
    if (err instanceof AxiosError) {
      const body = (err.response?.data ?? {}) as MetaErrorBody;
      const e = body.error;
      const message = `Meta Graph API error${err.response?.status ? ` (${err.response.status})` : ''}: ${e?.error_user_msg ?? e?.message ?? err.message}`;
      if (e?.code === 190 || e?.code === 102) return new ProviderError(message, ErrorCode.TOKEN_EXPIRED, false, e);
      const retryable = !!e?.is_transient || RATE_LIMIT_CODES.has(e?.code ?? -1) || !err.response || err.response.status >= 500;
      return new ProviderError(message, ErrorCode.PLATFORM_API_ERROR, retryable, e);
    }
    return new ProviderError(`Meta Graph API error: ${(err as Error).message}`, ErrorCode.PLATFORM_API_ERROR, true);
  }
}
