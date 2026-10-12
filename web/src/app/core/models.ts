/** Types mirroring the NestJS REST API (/api/v1). */

export type Platform = 'instagram' | 'facebook' | 'youtube' | 'linkedin' | 'x' | 'tiktok' | 'pinterest' | 'threads';
export const PUBLISHABLE_PLATFORMS: Platform[] = ['instagram', 'facebook', 'youtube', 'linkedin'];
export type ContentType = 'image' | 'carousel' | 'video' | 'reel';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_published' | 'failed' | 'cancelled';
export type PostPlatformStatus = 'pending' | 'queued' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type BrandRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  message: string;
  error: { code: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  timezone: string;
  roles: string[];
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
  sessionId: string;
}

export interface Session {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface BrandAiSettings {
  brandVoice?: string;
  keywords?: string[];
  avoidWords?: string[];
  useBrandingInImages?: boolean;
  emojiLevel?: 'none' | 'light' | 'heavy';
}

export interface BrandSettings {
  defaultLanguage?: string;
  defaultTone?: string;
  defaultCta?: string;
  timezone?: string;
  defaultHashtags?: string[];
  aiSettings?: BrandAiSettings;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  primaryColor: string;
  secondaryColor: string;
  role: BrandRole;
  settings?: BrandSettings;
  createdAt: string;
}

export interface BrandMember {
  id: string;
  userId: string;
  role: BrandRole;
  email: string;
  firstName: string;
  lastName: string | null;
  joinedAt: string;
}

export interface Media {
  id: string;
  brandId: string;
  folderId: string | null;
  type: 'image' | 'video' | 'logo' | 'thumbnail' | 'audio';
  source: 'upload' | 'ai_image' | 'ai_video';
  name: string;
  url: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  tags: string[] | null;
  createdAt: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  mediaCount: number;
}

export interface SocialAccount {
  id: string;
  brandId: string;
  platform: Platform;
  platformAccountId: string;
  accountName: string;
  accountType: string;
  username: string | null;
  profileImageUrl: string | null;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  statusMessage: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface PlatformInfo {
  platform: Platform;
  name: string;
  supported: boolean;
  configured: boolean;
  /** OAuth callback URL to register with the provider (null for planned platforms). */
  redirectUri?: string | null;
  capabilities: {
    contentTypes: ContentType[];
    maxCaptionLength: number;
    maxHashtags: number;
    maxCarouselItems: number;
    requiresMedia: boolean;
    supportsLinks: boolean;
  } | null;
}

export interface PostPlatformOptions {
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
  madeForKids?: boolean;
  shareToFeed?: boolean;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export interface PostPlatform {
  id: string;
  socialAccountId: string;
  platform: Platform;
  accountName: string | null;
  profileImageUrl: string | null;
  status: PostPlatformStatus;
  captionOverride: string | null;
  hashtagsOverride: string[] | null;
  titleOverride: string | null;
  options: PostPlatformOptions | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  publishedAt: string | null;
}

export interface PostMediaItem {
  id: string;
  url: string;
  type: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface ReelScript {
  hook: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export interface TextOverlay {
  text: string;
  startSeconds: number;
  endSeconds: number;
  position?: 'top' | 'center' | 'bottom';
}

export interface ReelData {
  script?: ReelScript | null;
  textOverlays?: TextOverlay[] | null;
  voiceOverEnabled?: boolean;
  voiceOverText?: string | null;
  voice?: string | null;
  subtitlesEnabled?: boolean;
  subtitlesSrt?: string | null;
  musicPreference?: string | null;
  durationSeconds?: number | null;
}

export interface Post {
  id: string;
  brandId: string;
  campaignId: string | null;
  title: string | null;
  contentType: ContentType;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  cta: string | null;
  linkUrl: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  thumbnail: PostMediaItem | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  timezone: string;
  media: PostMediaItem[];
  platforms: PostPlatform[];
  reel: ReelData | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  brandId: string;
  title: string;
  contentType: ContentType;
  status: PostStatus;
  date: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  platforms: { platform: Platform; status: PostPlatformStatus }[];
  thumbnailUrl: string | null;
}

export interface PublishBatch {
  batchId: string;
  postId: string;
  jobs: { jobId: string; postPlatformId: string; platform: Platform; accountName: string; status: string }[];
  skipped: { postPlatformId: string; platform: Platform; reason: string; errorCode: string }[];
}

export interface PlatformStatus {
  postPlatformId: string;
  platform: Platform;
  accountName: string;
  status: PostPlatformStatus;
  platformPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  latestJobId: string | null;
  attempts: number;
  publishedAt: string | null;
}

export interface PublishingJob {
  id: string;
  batchId: string;
  postId: string;
  platform: Platform;
  status: string;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  logs?: { id: string; level: string; event: string; message: string; createdAt: string }[];
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  objective: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  platforms: Platform[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  postCount?: number;
  aiPlan?: { days?: { day: number; theme: string; imagePrompt: string }[] } | null;
  posts?: { dayNumber: number; theme: string | null; post: Post }[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface UsageSnapshot {
  metric: string;
  used: number;
  limit: number;
  period: 'lifetime' | 'monthly';
  unlimited: boolean;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  isDefault: boolean;
  features: string[] | null;
  limits: { metric: string; limitValue: number; period: string }[];
}

export interface CurrentSubscription {
  subscription: { id: string; status: string; billingCycle: string; currentPeriodStart: string; currentPeriodEnd: string | null } | null;
  plan: Plan | null;
  usage: UsageSnapshot[];
}

export interface Dashboard {
  counts: {
    brands: number;
    posts: number;
    scheduled: number;
    published: number;
    failed: number;
    drafts: number;
    aiGenerations: number;
    connectedAccounts: number;
    engagement: number;
    reach: number;
  };
  upcoming: { id: string; brandId: string; title: string | null; caption: string | null; contentType: ContentType; scheduledAt: string }[];
  recentFailures: { jobId: string; postId: string; platform: Platform; errorCode: string; errorMessage: string; failedAt: string }[];
  recentPosts: { id: string; brandId: string; title: string | null; caption: string | null; contentType: ContentType; status: PostStatus; date: string }[];
}

export interface AnalyticsTotals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
}

export interface AnalyticsOverview {
  range: { from: string; to: string };
  summary: AnalyticsTotals & { followers: number; engagement: number; engagementRate: number; postsPublished: number };
  daily: { date: string; reach: number; impressions: number; engagement: number; videoViews: number }[];
  followers: { date: string; followers: number }[];
  platforms: (AnalyticsTotals & { platform: Platform; posts: number; engagement: number; engagementRate: number; followers: number })[];
  topPosts: { postId: string; title: string; contentType: ContentType; platforms: Platform[]; reach: number; impressions: number; engagement: number }[];
}

export interface AiResult<T> {
  generationId: string;
  result: T;
}

export interface AiJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number | null;
  images?: { index: number; url: string; mediaId: string | null }[];
  videoUrl?: string | null;
  mediaId?: string | null;
  storyboard?: Record<string, unknown> | null;
  subtitlesSrt?: string | null;
  error: string | null;
}
