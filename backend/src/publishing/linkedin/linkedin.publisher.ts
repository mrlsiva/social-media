import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
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
import { pollUntil, toProviderError } from '../publisher-http';

const API = 'https://api.linkedin.com';

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

/** Characters reserved by LinkedIn's "little text" commentary format. */
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

export function escapeLinkedInText(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}

/** Builds commentary with escaped text and properly formatted hashtags. */
export function buildCommentary(text: string, hashtags: string[]): string {
  // Hashtags already typed inline become hashtag entities; everything else is escaped.
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u).map((part) =>
    /^#[\p{L}\p{N}_]+$/u.test(part) ? `{hashtag|\\#|${part.slice(1)}}` : escapeLinkedInText(part),
  );
  const inline = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()));
  const extra = hashtags.filter((h) => !inline.has(h.toLowerCase())).map((h) => `{hashtag|\\#|${h}}`);
  return [parts.join(''), extra.join(' ')].filter(Boolean).join('\n\n');
}

/**
 * LinkedIn Posts API (versioned REST, `LinkedIn-Version: YYYYMM`).
 * Members need `w_member_social`; organization pages need the Community Management
 * API (`w_organization_social`, `rw_organization_admin`) - set LINKEDIN_SCOPES accordingly.
 */
@Injectable()
export class LinkedInPublisher implements SocialPublisher {
  readonly platform = SocialPlatform.LINKEDIN;
  readonly displayName = 'LinkedIn';
  readonly usesPkce = false;
  readonly capabilities: PlatformCapabilities = {
    contentTypes: [ContentType.IMAGE, ContentType.CAROUSEL, ContentType.VIDEO, ContentType.REEL],
    maxCaptionLength: 3000,
    maxHashtags: 30,
    maxCarouselItems: 20,
    requiresMedia: false,
    supportsLinks: true,
  };
  private readonly logger = new Logger(LinkedInPublisher.name);
  private readonly cfg: SocialConfig['linkedin'];
  private readonly scopes: string[];
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.cfg = config.getOrThrow<SocialConfig>('social').linkedin;
    this.scopes = (config.get<string>('LINKEDIN_SCOPES') ?? 'openid profile w_member_social').split(/[\s,]+/).filter(Boolean);
    this.http = axios.create({ timeout: 120_000 });
  }

  isConfigured(): boolean {
    return !!(this.cfg.clientId && this.cfg.clientSecret && this.cfg.redirectUri);
  }

  connect({ state }: { state: string }): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      state,
      scope: this.scopes.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async completeConnection({ code }: { code: string }): Promise<DiscoveredAccount[]> {
    const tokens = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.cfg.redirectUri });
    const credentials: OAuthCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: addSeconds(new Date(), tokens.expires_in),
      refreshExpiresAt: tokens.refresh_token_expires_in ? addSeconds(new Date(), tokens.refresh_token_expires_in) : null,
      scopes: tokens.scope ?? this.scopes.join(' '),
    };
    const me = await this.request<{ sub: string; name?: string; picture?: string; email?: string }>(credentials.accessToken, {
      method: 'GET',
      url: `${API}/v2/userinfo`,
    });

    const accounts: DiscoveredAccount[] = [];
    if (this.scopes.includes('w_member_social')) {
      accounts.push({
        platform: SocialPlatform.LINKEDIN,
        platformAccountId: `urn:li:person:${me.sub}`,
        platformUserId: me.sub,
        accountName: me.name ?? 'LinkedIn member',
        accountType: 'person',
        profileImageUrl: me.picture ?? null,
        credentials,
      });
    }

    if (this.scopes.includes('rw_organization_admin') || this.scopes.includes('r_organization_admin')) {
      try {
        const acls = await this.request<{ elements?: { organization: string }[] }>(credentials.accessToken, {
          method: 'GET',
          url: `${API}/rest/organizationAcls`,
          params: { q: 'roleAssignee', role: 'ADMINISTRATOR', state: 'APPROVED' },
        });
        for (const acl of acls.elements ?? []) {
          const orgId = acl.organization.split(':').pop()!;
          const org = await this.request<{ localizedName?: string; vanityName?: string }>(credentials.accessToken, {
            method: 'GET',
            url: `${API}/rest/organizations/${orgId}`,
          });
          accounts.push({
            platform: SocialPlatform.LINKEDIN,
            platformAccountId: acl.organization,
            platformUserId: me.sub,
            accountName: org.localizedName ?? `Organization ${orgId}`,
            accountType: 'organization',
            username: org.vanityName ?? null,
            profileImageUrl: null,
            credentials,
          });
        }
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'Could not list LinkedIn organizations');
      }
    }
    return accounts;
  }

  async refreshToken(_account: SocialAccount, credentials: OAuthCredentials): Promise<OAuthCredentials | null> {
    // Programmatic refresh tokens are only issued to approved LinkedIn partners.
    if (!credentials.refreshToken) return null;
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? credentials.refreshToken,
      expiresAt: addSeconds(new Date(), tokens.expires_in),
      refreshExpiresAt: tokens.refresh_token_expires_in ? addSeconds(new Date(), tokens.refresh_token_expires_in) : credentials.refreshExpiresAt,
      scopes: tokens.scope ?? credentials.scopes,
    };
  }

  async validateAccount(_account: SocialAccount, credentials: OAuthCredentials): Promise<AccountValidation> {
    try {
      const me = await this.request<{ name?: string; picture?: string }>(credentials.accessToken, { method: 'GET', url: `${API}/v2/userinfo` });
      return { valid: true, tokenExpired: false, accountName: _account.accountType === 'person' ? me.name : undefined, profileImageUrl: _account.accountType === 'person' ? me.picture ?? null : undefined };
    } catch (err) {
      const e = err as ProviderError;
      return { valid: false, tokenExpired: e.code === ErrorCode.TOKEN_EXPIRED, message: e.message };
    }
  }

  validateContent(ctx: PublishContext): string[] {
    const errors = validateCommon(ctx, this.capabilities, this.displayName);
    const images = ctx.media.filter((m) => m.kind === 'image');
    const videos = ctx.media.filter((m) => m.kind === 'video');
    if (images.length > 0 && videos.length > 0) errors.push('LinkedIn posts cannot mix images and videos');
    if (videos.length > 1) errors.push('LinkedIn posts support a single video');
    if (ctx.contentType === ContentType.CAROUSEL && images.length === 1) errors.push('LinkedIn multi-image posts need at least 2 images');
    if (ctx.media.length === 0 && !ctx.content.text.trim()) errors.push('LinkedIn post needs text or media');
    return errors;
  }

  /** Uploads an image or video and returns its URN (urn:li:image:... / urn:li:video:...). */
  async uploadMedia(ctx: PublishContext, media: PublishMedia): Promise<string> {
    return media.kind === 'image' ? this.uploadImage(ctx, media) : this.uploadVideo(ctx, media);
  }

  async publishPost(ctx: PublishContext): Promise<PublishResult> {
    const images = ctx.media.filter((m) => m.kind === 'image');
    let content: Record<string, unknown> | undefined;
    if (images.length === 1) {
      content = { media: { id: await this.uploadMedia(ctx, images[0]), altText: ctx.post.title ?? '' } };
    } else if (images.length > 1) {
      const urns: string[] = [];
      for (const img of images) urns.push(await this.uploadMedia(ctx, img));
      content = { multiImage: { images: urns.map((id) => ({ id, altText: '' })) } };
    } else if (ctx.content.linkUrl) {
      content = { article: { source: ctx.content.linkUrl, title: (ctx.post.title ?? ctx.content.text.split('\n')[0] ?? ctx.content.linkUrl).slice(0, 200) } };
    }
    return this.createPost(ctx, content);
  }

  async publishVideo(ctx: PublishContext): Promise<PublishResult> {
    const video = ctx.media.find((m) => m.kind === 'video')!;
    const urn = await this.uploadMedia(ctx, video);
    return this.createPost(ctx, { media: { id: urn, title: (ctx.content.title ?? ctx.post.title ?? '').slice(0, 200) } });
  }

  async getPublishingStatus(_account: SocialAccount, credentials: OAuthCredentials, postUrn: string): Promise<PublishingStatus> {
    try {
      const post = await this.request<{ lifecycleState?: string }>(credentials.accessToken, {
        method: 'GET',
        url: `${API}/rest/posts/${encodeURIComponent(postUrn)}`,
      });
      return post.lifecycleState === 'PUBLISHED' ? { status: 'published' } : { status: 'processing', detail: post.lifecycleState };
    } catch {
      return { status: 'unknown' };
    }
  }

  async fetchPostMetrics(_account: SocialAccount, credentials: OAuthCredentials, postUrn: string): Promise<PostMetrics> {
    const res = await this.request<{ likesSummary?: { totalLikes?: number }; commentsSummary?: { aggregatedTotalComments?: number; totalFirstLevelComments?: number } }>(
      credentials.accessToken,
      { method: 'GET', url: `${API}/rest/socialActions/${encodeURIComponent(postUrn)}` },
    );
    return {
      likes: res.likesSummary?.totalLikes ?? 0,
      comments: res.commentsSummary?.aggregatedTotalComments ?? res.commentsSummary?.totalFirstLevelComments ?? 0,
    };
  }

  async fetchAccountMetrics(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountMetrics> {
    if (account.accountType !== 'organization') return {};
    const res = await this.request<{ firstDegreeSize?: number }>(credentials.accessToken, {
      method: 'GET',
      url: `${API}/rest/networkSizes/${encodeURIComponent(account.platformAccountId)}`,
      params: { edgeType: 'COMPANY_FOLLOWED_BY_MEMBER' },
    });
    return { followers: res.firstDegreeSize ?? 0 };
  }

  async revoke(credentials: OAuthCredentials): Promise<void> {
    const body = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, token: credentials.accessToken });
    await this.http.post('https://www.linkedin.com/oauth/v2/revoke', body).catch(() => undefined);
  }

  // ---------------------------------------------------------------- internals

  private async createPost(ctx: PublishContext, content?: Record<string, unknown>): Promise<PublishResult> {
    await ctx.log('linkedin.post', 'Creating LinkedIn post');
    const res = await this.call(() =>
      this.http.post(
        `${API}/rest/posts`,
        {
          author: ctx.account.platformAccountId,
          commentary: buildCommentary(ctx.content.text, ctx.content.hashtags),
          visibility: ctx.options.visibility ?? 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          ...(content ? { content } : {}),
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
        { headers: this.headers(ctx.credentials.accessToken) },
      ),
    );
    const urn = (res.headers['x-restli-id'] ?? res.headers['x-linkedin-id']) as string | undefined;
    if (!urn) throw new ProviderError('LinkedIn did not return the post id', ErrorCode.PUBLISH_FAILED);
    return { platformPostId: urn, platformPostUrl: `https://www.linkedin.com/feed/update/${urn}` };
  }

  private async uploadImage(ctx: PublishContext, media: PublishMedia): Promise<string> {
    const init = await this.request<{ value: { uploadUrl: string; image: string } }>(ctx.credentials.accessToken, {
      method: 'POST',
      url: `${API}/rest/images`,
      params: { action: 'initializeUpload' },
      data: { initializeUploadRequest: { owner: ctx.account.platformAccountId } },
    });
    await ctx.log('linkedin.image', 'Uploading image');
    const blob = await media.toBlob();
    await this.call(() =>
      this.http.put(init.value.uploadUrl, blob, {
        headers: { Authorization: `Bearer ${ctx.credentials.accessToken}`, 'Content-Type': media.mimeType },
        maxBodyLength: Infinity,
      }),
    );
    return init.value.image;
  }

  private async uploadVideo(ctx: PublishContext, media: PublishMedia): Promise<string> {
    const token = ctx.credentials.accessToken;
    const blob = await media.toBlob();
    const init = await this.request<{
      value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[]; thumbnailUploadUrl?: string };
    }>(token, {
      method: 'POST',
      url: `${API}/rest/videos`,
      params: { action: 'initializeUpload' },
      data: {
        initializeUploadRequest: {
          owner: ctx.account.platformAccountId,
          fileSizeBytes: blob.size,
          uploadCaptions: false,
          uploadThumbnail: !!ctx.thumbnail,
        },
      },
    });

    await ctx.log('linkedin.video', `Uploading video in ${init.value.uploadInstructions.length} part(s)`);
    const etags: string[] = [];
    for (const part of init.value.uploadInstructions) {
      const res = await this.call(() =>
        this.http.put(part.uploadUrl, blob.slice(part.firstByte, part.lastByte + 1), {
          headers: { 'Content-Type': 'application/octet-stream' },
          maxBodyLength: Infinity,
          timeout: 30 * 60_000,
        }),
      );
      etags.push(String(res.headers['etag'] ?? ''));
    }

    if (ctx.thumbnail && init.value.thumbnailUploadUrl) {
      const thumb = await ctx.thumbnail.toBlob();
      await this.call(() => this.http.put(init.value.thumbnailUploadUrl!, thumb, { headers: { 'Content-Type': ctx.thumbnail!.mimeType } })).catch((err: unknown) =>
        ctx.log('linkedin.thumbnail', `Thumbnail not applied: ${(err as Error).message}`),
      );
    }

    await this.request(token, {
      method: 'POST',
      url: `${API}/rest/videos`,
      params: { action: 'finalizeUpload' },
      data: { finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken, uploadedPartIds: etags } },
    });

    await pollUntil(
      async () => {
        const v = await this.request<{ status?: string }>(token, { method: 'GET', url: `${API}/rest/videos/${encodeURIComponent(init.value.video)}` });
        if (v.status === 'AVAILABLE') return true;
        if (v.status === 'PROCESSING_FAILED') throw new ProviderError('LinkedIn failed to process the video', ErrorCode.PUBLISH_FAILED);
        return null;
      },
      { intervalMs: 5000, timeoutMs: 15 * 60_000, timeoutMessage: 'video is still processing', platform: 'LinkedIn' },
    );
    return init.value.video;
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': this.cfg.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(token: string, config: AxiosRequestConfig): Promise<T> {
    const res = await this.call(() => this.http.request<T>({ ...config, headers: { ...this.headers(token), ...(config.headers ?? {}) } }));
    return res.data;
  }

  private async tokenRequest(params: Record<string, string>): Promise<LinkedInTokenResponse> {
    const body = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...params });
    const res = await this.call(() => this.http.post<LinkedInTokenResponse>('https://www.linkedin.com/oauth/v2/accessToken', body));
    return res.data;
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw toProviderError('LinkedIn', err);
    }
  }
}
