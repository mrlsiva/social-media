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

const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'read_insights', 'business_management'];

/**
 * Facebook Pages publishing via the Graph API.
 * - Photo:     POST /{page-id}/photos
 * - Multi-photo: unpublished photos + POST /{page-id}/feed (attached_media)
 * - Text/link: POST /{page-id}/feed
 * - Video:     POST graph-video /{page-id}/videos
 * - Reel:      POST /{page-id}/video_reels (start -> rupload -> finish)
 */
@Injectable()
export class FacebookPublisher implements SocialPublisher {
  readonly platform = SocialPlatform.FACEBOOK;
  readonly displayName = 'Facebook';
  readonly usesPkce = false;
  readonly capabilities: PlatformCapabilities = {
    contentTypes: [ContentType.IMAGE, ContentType.CAROUSEL, ContentType.VIDEO, ContentType.REEL],
    maxCaptionLength: 63206,
    maxHashtags: 30,
    maxCarouselItems: 10,
    requiresMedia: false,
    supportsLinks: true,
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
    const pages = await this.graph.listPages(accessToken, 'id,name,access_token,username,category,tasks,picture{url}');
    return pages
      .filter((p) => p.access_token && (!p.tasks || p.tasks.includes('CREATE_CONTENT')))
      .map((p) => ({
        platform: SocialPlatform.FACEBOOK,
        platformAccountId: p.id,
        platformUserId: me.id,
        accountName: p.name,
        accountType: 'page',
        username: p.username ?? null,
        profileImageUrl: p.picture?.data?.url ?? null,
        metadata: { category: p.category ?? null },
        // Page tokens derived from a long-lived user token have no expiry.
        credentials: { accessToken: p.access_token!, expiresAt: null, scopes: SCOPES.join(',') },
      }));
  }

  async refreshToken(): Promise<OAuthCredentials | null> {
    return null; // Long-lived page tokens do not expire; on revocation the user must reconnect.
  }

  async validateAccount(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountValidation> {
    try {
      const page = await this.graph.get<{ id: string; name: string; picture?: { data?: { url?: string } } }>(
        `/${account.platformAccountId}`,
        { fields: 'id,name,picture{url}' },
        credentials.accessToken,
      );
      return { valid: true, tokenExpired: false, accountName: page.name, profileImageUrl: page.picture?.data?.url ?? null };
    } catch (err) {
      const e = err as ProviderError;
      return { valid: false, tokenExpired: e.code === ErrorCode.TOKEN_EXPIRED, message: e.message };
    }
  }

  validateContent(ctx: PublishContext): string[] {
    const errors = validateCommon(ctx, this.capabilities, this.displayName);
    if (ctx.contentType === ContentType.CAROUSEL && ctx.media.some((m) => m.kind === 'video')) {
      errors.push('Facebook multi-photo posts cannot contain videos. Publish the video separately.');
    }
    if ((ctx.contentType === ContentType.IMAGE || ctx.contentType === ContentType.CAROUSEL) && ctx.media.length === 0 && !ctx.content.text) {
      errors.push('Facebook post needs text, a link or media');
    }
    return errors;
  }

  /** Uploads an unpublished photo and returns its media_fbid. */
  async uploadMedia(ctx: PublishContext, media: PublishMedia): Promise<string> {
    const res = await this.uploadPhoto(ctx, media, { published: false });
    return res.id;
  }

  async publishPost(ctx: PublishContext): Promise<PublishResult> {
    const pageId = ctx.account.platformAccountId;
    const images = ctx.media.filter((m) => m.kind === 'image');

    if (images.length === 1) {
      await ctx.log('facebook.photo', 'Publishing single photo');
      const res = await this.uploadPhoto(ctx, images[0], { published: true, caption: ctx.content.text });
      const postId = res.post_id ?? res.id;
      return { platformPostId: postId, platformPostUrl: `https://www.facebook.com/${postId}` };
    }

    const attached: { media_fbid: string }[] = [];
    for (const image of images) {
      attached.push({ media_fbid: await this.uploadMedia(ctx, image) });
    }
    await ctx.log('facebook.feed', `Publishing feed post with ${attached.length} photo(s)`);
    const res = await this.graph.post<{ id: string }>(
      `/${pageId}/feed`,
      {
        message: ctx.content.text,
        ...(attached.length ? { attached_media: attached } : {}),
        ...(attached.length === 0 && ctx.content.linkUrl ? { link: ctx.content.linkUrl } : {}),
      },
      ctx.credentials.accessToken,
    );
    return { platformPostId: res.id, platformPostUrl: `https://www.facebook.com/${res.id}` };
  }

  async publishVideo(ctx: PublishContext): Promise<PublishResult> {
    const video = ctx.media.find((m) => m.kind === 'video')!;
    return ctx.contentType === ContentType.REEL ? this.publishReel(ctx, video) : this.publishPageVideo(ctx, video);
  }

  async getPublishingStatus(_account: SocialAccount, credentials: OAuthCredentials, platformPostId: string): Promise<PublishingStatus> {
    try {
      const res = await this.graph.get<{ status?: { video_status?: string } }>(`/${platformPostId}`, { fields: 'status' }, credentials.accessToken);
      const s = res.status?.video_status;
      if (!s) return { status: 'published' };
      if (s === 'ready') return { status: 'published' };
      if (s === 'error') return { status: 'failed', detail: 'Video processing failed' };
      return { status: 'processing', detail: s };
    } catch {
      return { status: 'unknown' };
    }
  }

  async fetchPostMetrics(_account: SocialAccount, credentials: OAuthCredentials, postId: string): Promise<PostMetrics> {
    const res = await this.graph.get<{
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }>(`/${postId}`, { fields: 'shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' }, credentials.accessToken);
    const metrics: PostMetrics = {
      likes: res.reactions?.summary?.total_count ?? 0,
      comments: res.comments?.summary?.total_count ?? 0,
      shares: res.shares?.count ?? 0,
    };
    // Insights metric names change between Graph versions; treat as best-effort.
    try {
      const insights = await this.graph.get<{ data: { name: string; values: { value: number }[] }[] }>(
        `/${postId}/insights`,
        { metric: 'post_impressions_unique,post_impressions' },
        credentials.accessToken,
      );
      for (const m of insights.data) {
        const value = m.values?.[0]?.value ?? 0;
        if (m.name === 'post_impressions_unique') metrics.reach = value;
        if (m.name === 'post_impressions') metrics.impressions = value;
      }
    } catch {
      /* insights unavailable for this post/version */
    }
    return metrics;
  }

  async fetchAccountMetrics(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountMetrics> {
    const res = await this.graph.get<{ followers_count?: number; fan_count?: number }>(
      `/${account.platformAccountId}`,
      { fields: 'followers_count,fan_count' },
      credentials.accessToken,
    );
    return { followers: res.followers_count ?? res.fan_count ?? 0 };
  }

  // ---------------------------------------------------------------- internals

  private async uploadPhoto(ctx: PublishContext, media: PublishMedia, extra: { published: boolean; caption?: string }) {
    const path = `/${ctx.account.platformAccountId}/photos`;
    if (media.isPubliclyReachable) {
      return this.graph.post<{ id: string; post_id?: string }>(path, { url: media.url, ...extra }, ctx.credentials.accessToken);
    }
    const form = new FormData();
    form.append('source', await media.toBlob(), `photo.${media.mimeType.split('/')[1]}`);
    form.append('published', String(extra.published));
    if (extra.caption) form.append('caption', extra.caption);
    return this.graph.postMultipart<{ id: string; post_id?: string }>(path, form, ctx.credentials.accessToken);
  }

  private async publishPageVideo(ctx: PublishContext, video: PublishMedia): Promise<PublishResult> {
    const pageId = ctx.account.platformAccountId;
    await ctx.log('facebook.video', 'Uploading page video');
    const form = new FormData();
    if (video.isPubliclyReachable) form.append('file_url', video.url);
    else form.append('source', await video.toBlob(), 'video.mp4');
    form.append('description', ctx.content.text);
    if (ctx.content.title) form.append('title', ctx.content.title);
    if (ctx.thumbnail) form.append('thumb', await ctx.thumbnail.toBlob(), 'thumb.jpg');
    const res = await this.graph.postMultipart<{ id: string }>(`/${pageId}/videos`, form, ctx.credentials.accessToken, { video: true });
    return { platformPostId: res.id, platformPostUrl: `https://www.facebook.com/${pageId}/videos/${res.id}` };
  }

  private async publishReel(ctx: PublishContext, video: PublishMedia): Promise<PublishResult> {
    const pageId = ctx.account.platformAccountId;
    const token = ctx.credentials.accessToken;
    const start = await this.graph.post<{ video_id: string; upload_url: string }>(`/${pageId}/video_reels`, { upload_phase: 'start' }, token);
    await ctx.log('facebook.reel.upload', 'Uploading reel video', { videoId: start.video_id });
    await this.graph.ruploadBinary(start.upload_url ?? `https://rupload.facebook.com/video-upload/${this.graph.version}/${start.video_id}`, token, await video.toBlob());

    await this.graph.post(`/${pageId}/video_reels`, {
      upload_phase: 'finish',
      video_id: start.video_id,
      video_state: 'PUBLISHED',
      description: ctx.content.text,
      ...(ctx.content.title ? { title: ctx.content.title } : {}),
    }, token);

    // Wait until Facebook finishes processing so we never report a reel as published prematurely.
    await pollUntil(
      async () => {
        const res = await this.graph.get<{ status?: { video_status?: string; processing_phase?: { status?: string; error?: { message?: string } } } }>(
          `/${start.video_id}`,
          { fields: 'status' },
          token,
        );
        const s = res.status?.video_status;
        if (s === 'error' || res.status?.processing_phase?.status === 'error') {
          throw new ProviderError(`Facebook reel processing failed: ${res.status?.processing_phase?.error?.message ?? 'unknown error'}`, ErrorCode.PUBLISH_FAILED);
        }
        return s === 'ready' || s === 'published' ? true : null;
      },
      { intervalMs: 5000, timeoutMs: 10 * 60_000, timeoutMessage: 'reel is still processing', platform: 'Facebook' },
    );
    return { platformPostId: start.video_id, platformPostUrl: `https://www.facebook.com/reel/${start.video_id}` };
  }
}
