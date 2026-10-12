import { ContentType, SocialPlatform } from '../common/enums';
import {
  PlatformCapabilities,
  PublishContext,
} from './interfaces/social-publisher.interface';

/** Shared validation used by all publishers before calling the platform. */
export function validateCommon(ctx: PublishContext, caps: PlatformCapabilities, platformName: string): string[] {
  const errors: string[] = [];
  if (!caps.contentTypes.includes(ctx.contentType)) {
    errors.push(`${platformName} does not support "${ctx.contentType}" posts through its API`);
  }
  if (ctx.content.text.length > caps.maxCaptionLength) {
    errors.push(`${platformName} captions are limited to ${caps.maxCaptionLength} characters (current: ${ctx.content.text.length})`);
  }
  if (ctx.content.hashtags.length > caps.maxHashtags) {
    errors.push(`${platformName} allows at most ${caps.maxHashtags} hashtags (current: ${ctx.content.hashtags.length})`);
  }
  if (caps.requiresMedia && ctx.media.length === 0) {
    errors.push(`${platformName} posts require at least one image or video`);
  }
  if (ctx.media.length > caps.maxCarouselItems) {
    errors.push(`${platformName} allows at most ${caps.maxCarouselItems} media items per post`);
  }
  const isVideoType = ctx.contentType === ContentType.VIDEO || ctx.contentType === ContentType.REEL;
  if (isVideoType && !ctx.media.some((m) => m.kind === 'video')) {
    errors.push(`A ${ctx.contentType} post needs a video`);
  }
  return errors;
}

export const PLATFORM_NAMES: Record<string, string> = {
  [SocialPlatform.INSTAGRAM]: 'Instagram',
  [SocialPlatform.FACEBOOK]: 'Facebook',
  [SocialPlatform.YOUTUBE]: 'YouTube',
  [SocialPlatform.LINKEDIN]: 'LinkedIn',
  [SocialPlatform.X]: 'X',
  [SocialPlatform.TIKTOK]: 'TikTok',
  [SocialPlatform.PINTEREST]: 'Pinterest',
  [SocialPlatform.THREADS]: 'Threads',
};
