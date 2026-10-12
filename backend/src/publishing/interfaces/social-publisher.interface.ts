import { ContentType, SocialPlatform } from '../../common/enums';
import { Post } from '../../posts/entities/post.entity';
import { PostPlatform, PostPlatformOptions } from '../../posts/entities/post-platform.entity';
import { SocialAccount } from '../../social-accounts/entities/social-account.entity';

/** What a platform can publish through its official API. */
export interface PlatformCapabilities {
  contentTypes: ContentType[];
  maxCaptionLength: number;
  maxHashtags: number;
  maxCarouselItems: number;
  /** Platform cannot publish text-only posts. */
  requiresMedia: boolean;
  /** Links in captions are clickable. */
  supportsLinks: boolean;
}

/** Decrypted OAuth credentials - only ever held in memory inside the backend. */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string | null;
}

/** A page/channel/profile the user can choose to connect after OAuth. */
export interface DiscoveredAccount {
  platform: SocialPlatform;
  platformAccountId: string;
  platformUserId: string | null;
  accountName: string;
  accountType: string;
  username?: string | null;
  profileImageUrl?: string | null;
  metadata?: Record<string, unknown>;
  credentials: OAuthCredentials;
}

/** Media prepared for publishing (storage details abstracted away). */
export interface PublishMedia {
  id: string;
  kind: 'image' | 'video';
  mimeType: string;
  /** Public URL (from StorageService). */
  url: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  aiGenerated: boolean;
  /** True when `url` is HTTPS on a non-local host, i.e. platform servers can download it. */
  isPubliclyReachable: boolean;
  toBlob(): Promise<Blob>;
  /** Returns a public URL of a JPEG rendition (Instagram accepts JPEG only). */
  jpegUrl(): Promise<string>;
}

/** Text already adapted for the target platform. */
export interface ComposedContent {
  text: string;
  hashtags: string[];
  title: string | null;
  description: string | null;
  linkUrl: string | null;
}

export interface PublishContext {
  account: SocialAccount;
  credentials: OAuthCredentials;
  post: Post;
  postPlatform: PostPlatform;
  contentType: ContentType;
  content: ComposedContent;
  media: PublishMedia[];
  thumbnail: PublishMedia | null;
  options: PostPlatformOptions;
  /** Appends to publishing_logs (never pass tokens). */
  log(event: string, message: string, context?: Record<string, unknown>): Promise<void>;
}

export interface PublishResult {
  platformPostId: string;
  platformPostUrl: string | null;
  raw?: Record<string, unknown>;
}

export interface AccountValidation {
  valid: boolean;
  tokenExpired: boolean;
  message?: string;
  accountName?: string;
  profileImageUrl?: string | null;
}

export interface PublishingStatus {
  status: 'published' | 'processing' | 'failed' | 'unknown';
  detail?: string;
}

export interface PostMetrics {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  videoViews?: number;
  clicks?: number;
}

export interface AccountMetrics {
  followers?: number;
  impressions?: number;
  reach?: number;
  profileViews?: number;
  engagements?: number;
  videoViews?: number;
}

/**
 * Contract every social network integration implements.
 * Add a platform (X, TikTok, Pinterest, Threads...) by implementing this
 * interface and registering it in PublishersModule - nothing else changes.
 */
export interface SocialPublisher {
  readonly platform: SocialPlatform;
  readonly displayName: string;
  readonly capabilities: PlatformCapabilities;
  /** Whether the provider supports/uses PKCE in its OAuth flow. */
  readonly usesPkce: boolean;

  /** Credentials (client id/secret/redirect) are present in the environment. */
  isConfigured(): boolean;

  /** Step 1 of connect(): the provider authorization URL to redirect the user to. */
  connect(params: { state: string; codeChallenge?: string }): string;

  /** Step 2 of connect(): exchange the code and discover connectable accounts. */
  completeConnection(params: { code: string; codeVerifier?: string }): Promise<DiscoveredAccount[]>;

  /** Returns fresh credentials, or null when the token cannot be refreshed without the user. */
  refreshToken(account: SocialAccount, credentials: OAuthCredentials): Promise<OAuthCredentials | null>;

  validateAccount(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountValidation>;

  /** Platform-specific pre-flight validation. Returns human readable errors. */
  validateContent(ctx: PublishContext): string[];

  /** Uploads a media item to the platform and returns the platform media handle. */
  uploadMedia(ctx: PublishContext, media: PublishMedia): Promise<string>;

  /** Publishes image / carousel / text posts. */
  publishPost(ctx: PublishContext): Promise<PublishResult>;

  /** Publishes video / reel / short posts. */
  publishVideo(ctx: PublishContext): Promise<PublishResult>;

  getPublishingStatus(account: SocialAccount, credentials: OAuthCredentials, platformPostId: string): Promise<PublishingStatus>;

  fetchPostMetrics?(account: SocialAccount, credentials: OAuthCredentials, platformPostId: string): Promise<PostMetrics>;

  fetchAccountMetrics?(account: SocialAccount, credentials: OAuthCredentials): Promise<AccountMetrics>;

  /** Revokes the grant at the provider when the user disconnects (best effort). */
  revoke?(credentials: OAuthCredentials): Promise<void>;
}
