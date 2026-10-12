import { Injectable } from '@nestjs/common';
import { ProviderError } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContentType, SocialPlatform } from '../../common/enums';
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
import { pollUntil } from '../publisher-http';
import { MetaGraphClient } from '../meta/meta-graph.client';

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

type ContainerStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';

/**
 * Instagram professional accounts via "Instagram API with Facebook Login".
 * Publishing is a two-step container flow:
 *   POST /{ig-user-id}/media  ->  (poll status_code)  ->  POST /{ig-user-id}/media_publish
 * Images are fetched by Instagram from a public URL (JPEG only). Videos use a public
 * URL when available, otherwise the resumable upload (rupload.facebook.com).
 */
@Injectable()
export class InstagramPublisher implements SocialPublisher {
  readonly platform = SocialPlatform.INSTAGRAM;
  readonly displayName = 'Instagram';
  readonly usesPkce = false;
  readonly capabilities: PlatformCapabilities = {
    contentTypes: [ContentType.IMAGE, ContentType.CAROUSEL, ContentType.VIDEO, ContentType.REEL],
    maxCaptionLength: 2200,
    maxHashtags: 30,
    maxCarouselItems: 10,
    requiresMedia: true,
    supportsLinks: false,
  };

  constructor(private readonly graph: MetaGraphClient) {}

  isConfigured(): boolean {
    return this.graph.isConfigured();
  }

  connect({ state }: { state: string }): string {
    return this.graph.authorizationUrl(SCOPES, state);
  }

  async completeConnection({ code }: { code: string }): Promise<DiscoveredAccount[]> {
    const { accessToken } = await this.graph.exchangeCodeForLongLivedToken(code);
    const me = await this.graph.get<{ id: string }>('/me', { fields: 'id' }, accessToken);
    const pages = await this.graph.listPages(
      accessToken,
      'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
    );
    return pages
      .filter((p) => p.access_token && p.instagram_business_account?.id)
      .map((p) => {
        const ig = p.instagram_business_account!;
        return {
          platform: SocialPlatform.INSTAGRAM,
          platformAccountId: ig.id,
          platformUserId: me.id,
          accountName: ig.name ?? ig.username ?? p.name,
          accountType: 'instagram_business',
          username: ig.username ?? null,
          profileImageUrl: ig.profile_picture_url ?? null,
          metadata: { pageId: p.id, pageName: p.name },
          credentials: { accessToken: p.access_token!, expiresAt: null, scopes: SCOPES.join(',') },
        };
      });
  }

  async refreshToken(): Promise<OAuthCredentials | null> {
    return null; // Uses non-expiring page tokens; reconnect on revocation.
  }

  async validateAccount(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountValidation> {
    try {
      const res = await this.graph.get<{ id: string; username?: string; name?: string; profile_picture_url?: string }>(
        `/${account.platformAccountId}`,
        { fields: 'id,username,name,profile_picture_url' },
        credentials.accessToken,
      );
      return { valid: true, tokenExpired: false, accountName: res.name ?? res.username, profileImageUrl: res.profile_picture_url ?? null };
    } catch (err) {
      const e = err as ProviderError;
      return { valid: false, tokenExpired: e.code === ErrorCode.TOKEN_EXPIRED, message: e.message };
    }
  }

  validateContent(ctx: PublishContext): string[] {
    const errors = validateCommon(ctx, this.capabilities, this.displayName);
    const images = ctx.media.filter((m) => m.kind === 'image');
    if (images.some((m) => !m.isPubliclyReachable)) {
      errors.push(
        'Instagram downloads images from a public HTTPS URL. Set APP_URL to your public domain (or use S3 storage) before publishing to Instagram.',
      );
    }
    if (ctx.contentType === ContentType.CAROUSEL && ctx.media.length < 2) {
      errors.push('Instagram carousels need 2 to 10 items');
    }
    for (const img of images) {
      if (img.width && img.height) {
        const ratio = img.width / img.height;
        if (ratio < 0.8 - 0.01 || ratio > 1.91 + 0.01) {
          errors.push(`Instagram image aspect ratio must be between 4:5 and 1.91:1 (got ${img.width}x${img.height})`);
        }
      }
    }
    return errors;
  }

  /** Creates a media container for one item and waits until it is ready. Returns the container id. */
  async uploadMedia(ctx: PublishContext, media: PublishMedia, opts: { carouselItem?: boolean } = {}): Promise<string> {
    const igId = ctx.account.platformAccountId;
    const token = ctx.credentials.accessToken;
    let containerId: string;

    if (media.kind === 'image') {
      const res = await this.graph.post<{ id: string }>(
        `/${igId}/media`,
        { image_url: await media.jpegUrl(), ...(opts.carouselItem ? { is_carousel_item: true } : { caption: ctx.content.text }) },
        token,
      );
      containerId = res.id;
    } else {
      containerId = await this.createVideoContainer(ctx, media, opts.carouselItem ? { media_type: 'VIDEO', is_carousel_item: true } : {});
    }
    await this.waitForContainer(ctx, containerId);
    return containerId;
  }

  async publishPost(ctx: PublishContext): Promise<PublishResult> {
    const igId = ctx.account.platformAccountId;
    let creationId: string;
    if (ctx.media.length === 1 && ctx.media[0].kind === 'image') {
      await ctx.log('instagram.container', 'Creating image container');
      creationId = await this.uploadMedia(ctx, ctx.media[0]);
    } else {
      await ctx.log('instagram.carousel', `Creating ${ctx.media.length} carousel item containers`);
      const children: string[] = [];
      for (const item of ctx.media) children.push(await this.uploadMedia(ctx, item, { carouselItem: true }));
      const parent = await this.graph.post<{ id: string }>(
        `/${igId}/media`,
        { media_type: 'CAROUSEL', children: children.join(','), caption: ctx.content.text },
        ctx.credentials.accessToken,
      );
      await this.waitForContainer(ctx, parent.id);
      creationId = parent.id;
    }
    return this.publishContainer(ctx, creationId);
  }

  async publishVideo(ctx: PublishContext): Promise<PublishResult> {
    const video = ctx.media.find((m) => m.kind === 'video')!;
    await ctx.log('instagram.container', 'Creating reel container');
    // Instagram publishes feed videos as Reels (media_type=REELS).
    const containerId = await this.createVideoContainer(ctx, video, {
      media_type: 'REELS',
      caption: ctx.content.text,
      share_to_feed: ctx.options.shareToFeed ?? true,
      ...(ctx.thumbnail?.isPubliclyReachable ? { cover_url: await ctx.thumbnail.jpegUrl() } : {}),
    });
    await this.waitForContainer(ctx, containerId);
    return this.publishContainer(ctx, containerId);
  }

  async getPublishingStatus(_account: SocialAccount, credentials: OAuthCredentials, id: string): Promise<PublishingStatus> {
    try {
      const res = await this.graph.get<{ status_code?: ContainerStatus; permalink?: string }>(`/${id}`, { fields: 'status_code' }, credentials.accessToken);
      if (!res.status_code || res.status_code === 'PUBLISHED' || res.status_code === 'FINISHED') return { status: 'published' };
      if (res.status_code === 'IN_PROGRESS') return { status: 'processing' };
      return { status: 'failed', detail: res.status_code };
    } catch {
      return { status: 'unknown' };
    }
  }

  async fetchPostMetrics(_account: SocialAccount, credentials: OAuthCredentials, mediaId: string): Promise<PostMetrics> {
    const base = await this.graph.get<{ like_count?: number; comments_count?: number }>(
      `/${mediaId}`,
      { fields: 'like_count,comments_count' },
      credentials.accessToken,
    );
    const metrics: PostMetrics = { likes: base.like_count ?? 0, comments: base.comments_count ?? 0 };
    for (const metricSet of ['reach,saved,shares,views', 'reach,saved']) {
      try {
        const insights = await this.graph.get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
          `/${mediaId}/insights`,
          { metric: metricSet },
          credentials.accessToken,
        );
        for (const m of insights.data) {
          const value = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
          if (m.name === 'reach') metrics.reach = value;
          if (m.name === 'saved') metrics.saves = value;
          if (m.name === 'shares') metrics.shares = value;
          if (m.name === 'views') {
            metrics.videoViews = value;
            metrics.impressions = value;
          }
        }
        break;
      } catch {
        /* metric not available for this media type - try the smaller set */
      }
    }
    return metrics;
  }

  async fetchAccountMetrics(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountMetrics> {
    const res = await this.graph.get<{ followers_count?: number }>(`/${account.platformAccountId}`, { fields: 'followers_count' }, credentials.accessToken);
    return { followers: res.followers_count ?? 0 };
  }

  // ---------------------------------------------------------------- internals

  private async createVideoContainer(ctx: PublishContext, video: PublishMedia, params: Record<string, unknown>): Promise<string> {
    const igId = ctx.account.platformAccountId;
    const token = ctx.credentials.accessToken;
    if (video.isPubliclyReachable) {
      const res = await this.graph.post<{ id: string }>(`/${igId}/media`, { ...params, video_url: video.url }, token);
      return res.id;
    }
    // Local development / private storage: resumable upload of the bytes.
    const res = await this.graph.post<{ id: string; uri?: string }>(`/${igId}/media`, { ...params, upload_type: 'resumable' }, token);
    await ctx.log('instagram.upload', 'Uploading video bytes (resumable upload)', { containerId: res.id });
    const uploadUrl = res.uri ?? `https://rupload.facebook.com/ig-api-upload/${this.graph.version}/${res.id}`;
    await this.graph.ruploadBinary(uploadUrl, token, await video.toBlob());
    return res.id;
  }

  private async waitForContainer(ctx: PublishContext, containerId: string): Promise<void> {
    await pollUntil(
      async () => {
        const res = await this.graph.get<{ status_code: ContainerStatus; status?: string }>(
          `/${containerId}`,
          { fields: 'status_code,status' },
          ctx.credentials.accessToken,
        );
        if (res.status_code === 'FINISHED' || res.status_code === 'PUBLISHED') return true;
        if (res.status_code === 'ERROR' || res.status_code === 'EXPIRED') {
          throw new ProviderError(`Instagram could not process the media: ${res.status ?? res.status_code}`, ErrorCode.PUBLISH_FAILED);
        }
        return null;
      },
      { intervalMs: 5000, timeoutMs: 10 * 60_000, timeoutMessage: 'media container is still processing', platform: 'Instagram' },
    );
  }

  private async publishContainer(ctx: PublishContext, creationId: string): Promise<PublishResult> {
    await ctx.log('instagram.publish', 'Publishing container', { creationId });
    const published = await this.graph.post<{ id: string }>(
      `/${ctx.account.platformAccountId}/media_publish`,
      { creation_id: creationId },
      ctx.credentials.accessToken,
    );
    let permalink: string | null = null;
    try {
      permalink = (await this.graph.get<{ permalink?: string }>(`/${published.id}`, { fields: 'permalink' }, ctx.credentials.accessToken)).permalink ?? null;
    } catch {
      /* permalink is optional */
    }
    return { platformPostId: published.id, platformPostUrl: permalink };
  }
}
