import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ProviderError } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContentType, SocialPlatform } from '../../common/enums';
import { addSeconds } from '../../common/utils/duration';
import type { SocialConfig } from '../../config/configuration';
import { SocialAccount } from '../../social-accounts/entities/social-account.entity';
import { validateCommon } from '../base.publisher';
import {
  AccountMetrics,
  AccountValidation,
  DiscoveredAccount,
  OAuthCredentials,
  PlatformCapabilities,
  PostMetrics,
  PublishContext,
  PublishingStatus,
  PublishMedia,
  PublishResult,
  SocialPublisher,
} from '../interfaces/social-publisher.interface';
import { toProviderError } from '../publisher-http';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface YoutubeChannel {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; viewCount?: string };
}

/**
 * YouTube Data API v3 (videos and Shorts).
 * Upload: resumable session (videos.insert) -> PUT bytes -> optional thumbnails.set.
 * NOTE: uploads from unverified/unaudited API projects are locked to "private" by YouTube
 * until the project passes the YouTube API compliance audit.
 */
@Injectable()
export class YoutubePublisher implements SocialPublisher {
  readonly platform = SocialPlatform.YOUTUBE;
  readonly displayName = 'YouTube';
  readonly usesPkce = true;
  readonly capabilities: PlatformCapabilities = {
    contentTypes: [ContentType.VIDEO, ContentType.REEL],
    maxCaptionLength: 5000,
    maxHashtags: 15,
    maxCarouselItems: 1,
    requiresMedia: true,
    supportsLinks: true,
  };
  private readonly logger = new Logger(YoutubePublisher.name);
  private readonly cfg: SocialConfig['google'];
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.cfg = config.getOrThrow<SocialConfig>('social').google;
    this.http = axios.create({ timeout: 120_000 });
  }

  isConfigured(): boolean {
    return !!(this.cfg.clientId && this.cfg.clientSecret && this.cfg.redirectUri);
  }

  connect({ state, codeChallenge }: { state: string; codeChallenge?: string }): string {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async completeConnection({ code, codeVerifier }: { code: string; codeVerifier?: string }): Promise<DiscoveredAccount[]> {
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    if (!tokens.refresh_token) {
      this.logger.warn('Google did not return a refresh token; the connection will expire in ~1 hour');
    }
    const channels = await this.api<{ items?: YoutubeChannel[] }>(tokens.access_token, 'GET', `${API}/channels`, {
      params: { part: 'snippet,statistics', mine: true },
    });
    const credentials: OAuthCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: addSeconds(new Date(), tokens.expires_in),
      scopes: tokens.scope ?? SCOPES.join(' '),
    };
    return (channels.items ?? []).map((c) => ({
      platform: SocialPlatform.YOUTUBE,
      platformAccountId: c.id,
      platformUserId: c.id,
      accountName: c.snippet.title,
      accountType: 'channel',
      username: c.snippet.customUrl ?? null,
      profileImageUrl: c.snippet.thumbnails?.default?.url ?? null,
      metadata: { subscriberCount: Number(c.statistics?.subscriberCount ?? 0) },
      credentials,
    }));
  }

  async refreshToken(_account: SocialAccount, credentials: OAuthCredentials): Promise<OAuthCredentials | null> {
    if (!credentials.refreshToken) return null;
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? credentials.refreshToken,
      expiresAt: addSeconds(new Date(), tokens.expires_in),
      scopes: tokens.scope ?? credentials.scopes,
    };
  }

  async validateAccount(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountValidation> {
    try {
      const res = await this.api<{ items?: YoutubeChannel[] }>(credentials.accessToken, 'GET', `${API}/channels`, {
        params: { part: 'snippet', id: account.platformAccountId },
      });
      const channel = res.items?.[0];
      if (!channel) return { valid: false, tokenExpired: false, message: 'Channel not found or access revoked' };
      return { valid: true, tokenExpired: false, accountName: channel.snippet.title, profileImageUrl: channel.snippet.thumbnails?.default?.url ?? null };
    } catch (err) {
      const e = err as ProviderError;
      return { valid: false, tokenExpired: e.code === ErrorCode.TOKEN_EXPIRED, message: e.message };
    }
  }

  validateContent(ctx: PublishContext): string[] {
    const errors = validateCommon(ctx, this.capabilities, this.displayName);
    const title = ctx.content.title ?? '';
    if (!title.trim()) errors.push('YouTube requires a video title');
    if (title.length > 100) errors.push('YouTube titles are limited to 100 characters');
    if (/[<>]/.test(title) || /[<>]/.test(ctx.content.description ?? '')) errors.push('YouTube titles/descriptions cannot contain "<" or ">"');
    if (Buffer.byteLength(ctx.content.description ?? '', 'utf8') > 5000) errors.push('YouTube descriptions are limited to 5000 bytes');
    const video = ctx.media.find((m) => m.kind === 'video');
    if (ctx.contentType === ContentType.REEL && video?.durationSeconds && video.durationSeconds > 180) {
      errors.push('YouTube Shorts must be 3 minutes or shorter');
    }
    return errors;
  }

  /** Uploads the video via a resumable session and returns the YouTube video id. */
  async uploadMedia(ctx: PublishContext, media: PublishMedia): Promise<string> {
    const isShort = ctx.contentType === ContentType.REEL;
    let title = ctx.content.title ?? 'Untitled';
    let description = ctx.content.description ?? ctx.content.text;
    if (isShort && !/#shorts/i.test(`${title} ${description}`)) {
      if (title.length <= 92) title = `${title} #Shorts`;
      else description = `${description}\n\n#Shorts`;
    }
    const metadata = {
      snippet: {
        title,
        description,
        tags: ctx.content.hashtags.slice(0, 15),
        categoryId: ctx.options.categoryId ?? '22',
      },
      status: {
        privacyStatus: ctx.options.privacyStatus ?? 'public',
        selfDeclaredMadeForKids: ctx.options.madeForKids ?? false,
        // Disclose AI-generated (synthetic) media as required by YouTube policy.
        containsSyntheticMedia: media.aiGenerated,
      },
    };

    const session = await this.call(() =>
      this.http.post(`${UPLOAD_API}/videos`, metadata, {
        params: { uploadType: 'resumable', part: 'snippet,status' },
        headers: {
          Authorization: `Bearer ${ctx.credentials.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(media.sizeBytes),
          'X-Upload-Content-Type': media.mimeType,
        },
      }),
    );
    const location = session.headers['location'] as string | undefined;
    if (!location) throw new ProviderError('YouTube did not return an upload session URL', ErrorCode.PUBLISH_FAILED, true);

    await ctx.log('youtube.upload', 'Uploading video bytes', { sizeBytes: media.sizeBytes });
    const blob = await media.toBlob();
    const uploaded = await this.call(() =>
      this.http.put<{ id: string; status?: { uploadStatus?: string; rejectionReason?: string; failureReason?: string } }>(location, blob, {
        headers: { 'Content-Type': media.mimeType, 'Content-Length': String(blob.size) },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60 * 60_000,
      }),
    );
    const s = uploaded.data.status;
    if (s?.uploadStatus === 'rejected' || s?.uploadStatus === 'failed') {
      throw new ProviderError(`YouTube rejected the upload: ${s.rejectionReason ?? s.failureReason ?? s.uploadStatus}`, ErrorCode.PUBLISH_FAILED);
    }
    return uploaded.data.id;
  }

  async publishPost(): Promise<PublishResult> {
    throw new ProviderError('YouTube only supports video and Shorts uploads', ErrorCode.CONTENT_NOT_SUPPORTED);
  }

  async publishVideo(ctx: PublishContext): Promise<PublishResult> {
    const video = ctx.media.find((m) => m.kind === 'video')!;
    const videoId = await this.uploadMedia(ctx, video);

    if (ctx.thumbnail) {
      try {
        const thumb = await ctx.thumbnail.toBlob();
        await this.call(() =>
          this.http.post(`${UPLOAD_API}/thumbnails/set`, thumb, {
            params: { videoId },
            headers: { Authorization: `Bearer ${ctx.credentials.accessToken}`, 'Content-Type': ctx.thumbnail!.mimeType },
          }),
        );
      } catch (err) {
        // Custom thumbnails require a verified channel - do not fail the publish for it.
        await ctx.log('youtube.thumbnail', `Thumbnail not applied: ${(err as Error).message}`);
      }
    }

    const url = ctx.contentType === ContentType.REEL ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
    return { platformPostId: videoId, platformPostUrl: url, raw: { privacyStatus: ctx.options.privacyStatus ?? 'public' } };
  }

  async getPublishingStatus(_account: SocialAccount, credentials: OAuthCredentials, videoId: string): Promise<PublishingStatus> {
    const res = await this.api<{ items?: { status?: { uploadStatus?: string; failureReason?: string; rejectionReason?: string } }[] }>(
      credentials.accessToken,
      'GET',
      `${API}/videos`,
      { params: { part: 'status', id: videoId } },
    );
    const s = res.items?.[0]?.status;
    if (!s) return { status: 'unknown', detail: 'Video not found' };
    if (s.uploadStatus === 'processed') return { status: 'published' };
    if (s.uploadStatus === 'uploaded') return { status: 'processing' };
    return { status: 'failed', detail: s.failureReason ?? s.rejectionReason ?? s.uploadStatus };
  }

  async fetchPostMetrics(_account: SocialAccount, credentials: OAuthCredentials, videoId: string): Promise<PostMetrics> {
    const res = await this.api<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
      credentials.accessToken,
      'GET',
      `${API}/videos`,
      { params: { part: 'statistics', id: videoId } },
    );
    const st = res.items?.[0]?.statistics ?? {};
    const views = Number(st.viewCount ?? 0);
    return { videoViews: views, impressions: views, likes: Number(st.likeCount ?? 0), comments: Number(st.commentCount ?? 0) };
  }

  async fetchAccountMetrics(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountMetrics> {
    const res = await this.api<{ items?: YoutubeChannel[] }>(credentials.accessToken, 'GET', `${API}/channels`, {
      params: { part: 'statistics', id: account.platformAccountId },
    });
    const st = res.items?.[0]?.statistics;
    return { followers: Number(st?.subscriberCount ?? 0), videoViews: Number(st?.viewCount ?? 0) };
  }

  async revoke(credentials: OAuthCredentials): Promise<void> {
    const token = credentials.refreshToken ?? credentials.accessToken;
    await this.call(() => this.http.post('https://oauth2.googleapis.com/revoke', new URLSearchParams({ token })));
  }

  // ---------------------------------------------------------------- internals

  private async tokenRequest(params: Record<string, string>): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...params });
    const res = await this.call(() => this.http.post<GoogleTokenResponse>('https://oauth2.googleapis.com/token', body));
    return res.data;
  }

  private async api<T>(token: string, method: 'GET' | 'POST', url: string, opts: { params?: Record<string, unknown>; data?: unknown } = {}): Promise<T> {
    const res = await this.call(() =>
      this.http.request<T>({ method, url, params: opts.params, data: opts.data, headers: { Authorization: `Bearer ${token}` } }),
    );
    return res.data;
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const e = toProviderError('YouTube', err);
      // Quota exhaustion is reported as 403 quotaExceeded: retry later rather than fail permanently.
      if (/quotaExceeded|rateLimitExceeded/i.test(e.message)) {
        throw new ProviderError(`${e.message} (daily YouTube API quota reached)`, ErrorCode.PLATFORM_API_ERROR, true);
      }
      throw e;
    }
  }
}
