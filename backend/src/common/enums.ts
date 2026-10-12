/**
 * Platforms are stored as VARCHAR (not DB enums) so new providers
 * (X, TikTok, Pinterest, Threads...) can be added without a schema migration.
 */
export enum SocialPlatform {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  YOUTUBE = 'youtube',
  LINKEDIN = 'linkedin',
  // Planned providers (no publisher registered yet)
  X = 'x',
  TIKTOK = 'tiktok',
  PINTEREST = 'pinterest',
  THREADS = 'threads',
}

export enum ContentType {
  IMAGE = 'image',
  CAROUSEL = 'carousel',
  VIDEO = 'video',
  REEL = 'reel',
}

export enum PostStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  PARTIALLY_PUBLISHED = 'partially_published',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PostPlatformStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PublishingJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum BrandRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  LOGO = 'logo',
  THUMBNAIL = 'thumbnail',
  AUDIO = 'audio',
}

export enum MediaSource {
  UPLOAD = 'upload',
  AI_IMAGE = 'ai_image',
  AI_VIDEO = 'ai_video',
}

export enum SocialAccountStatus {
  CONNECTED = 'connected',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ERROR = 'error',
}

export enum AiGenerationType {
  CAPTION = 'caption',
  HASHTAGS = 'hashtags',
  POST_IDEAS = 'post_ideas',
  REEL_IDEAS = 'reel_ideas',
  REEL_SCRIPT = 'reel_script',
  PLATFORM_CONTENT = 'platform_content',
  CAMPAIGN_PLAN = 'campaign_plan',
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum AiGenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum ScheduledPostStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/** Metrics that can be limited per plan through `usage_limits`. */
export enum UsageMetric {
  BRANDS = 'brands',
  SOCIAL_ACCOUNTS = 'social_accounts',
  TEAM_MEMBERS = 'team_members',
  SCHEDULED_POSTS = 'scheduled_posts',
  STORAGE_MB = 'storage_mb',
  AI_GENERATIONS = 'ai_generations',
  AI_CAPTION = 'ai_caption',
  AI_HASHTAGS = 'ai_hashtags',
  AI_IMAGE = 'ai_image',
  AI_VIDEO = 'ai_video',
}

export enum LimitPeriod {
  LIFETIME = 'lifetime',
  MONTHLY = 'monthly',
}

export enum NotificationType {
  PUBLISH_SUCCESS = 'publish_success',
  PUBLISH_FAILED = 'publish_failed',
  SCHEDULED_REMINDER = 'scheduled_reminder',
  AI_GENERATION_COMPLETED = 'ai_generation_completed',
  VIDEO_GENERATION_COMPLETED = 'video_generation_completed',
  TOKEN_EXPIRED = 'token_expired',
}

export enum ClientPlatform {
  WEB = 'web',
  ANDROID = 'android',
  IOS = 'ios',
  OTHER = 'other',
}
