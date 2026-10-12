/** BullMQ queue names. */
export const QUEUES = {
  PUBLISHING: 'publishing',
  SCHEDULER: 'scheduled-posts',
  AI: 'ai-generation',
  MEDIA: 'media-processing',
  ANALYTICS: 'analytics-sync',
  MAINTENANCE: 'maintenance',
  NOTIFICATIONS: 'notifications',
} as const;

/** Job names per queue. */
export const JOBS = {
  PUBLISH_PLATFORM: 'publish-platform',
  SCHEDULED_POST: 'scheduled-post',
  AI_IMAGE: 'ai-image',
  AI_VIDEO_START: 'ai-video-start',
  AI_VIDEO_POLL: 'ai-video-poll',
  MEDIA_PROBE: 'media-probe',
  ANALYTICS_SYNC_ALL: 'analytics-sync-all',
  ANALYTICS_SYNC_BRAND: 'analytics-sync-brand',
  TOKEN_REFRESH: 'token-refresh',
  SCHEDULE_SWEEP: 'schedule-sweep',
  PUSH_NOTIFICATION: 'push-notification',
} as const;
