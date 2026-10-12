import { Media } from '../media/entities/media.entity';
import { PostMediaResponseDto, PostResponseDto } from './dto/post.dto';
import { Post } from './entities/post.entity';

const toMedia = (media: Media, position: number): PostMediaResponseDto => ({
  id: media.id,
  url: media.url,
  type: media.type,
  mimeType: media.mimeType,
  width: media.width,
  height: media.height,
  position,
});

export function toPostResponse(post: Post, thumbnail?: Media | null): PostResponseDto {
  return {
    id: post.id,
    brandId: post.brandId,
    campaignId: post.campaignId,
    title: post.title,
    contentType: post.contentType,
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    mentions: post.mentions ?? [],
    cta: post.cta,
    linkUrl: post.linkUrl,
    videoTitle: post.videoTitle,
    videoDescription: post.videoDescription,
    thumbnail: thumbnail ? toMedia(thumbnail, 0) : null,
    status: post.status,
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    timezone: post.timezone,
    media: (post.media ?? [])
      .filter((pm) => pm.media)
      .sort((a, b) => a.position - b.position)
      .map((pm) => toMedia(pm.media, pm.position)),
    platforms: (post.platforms ?? []).map((pp) => ({
      id: pp.id,
      socialAccountId: pp.socialAccountId,
      platform: pp.platform,
      accountName: pp.socialAccount?.accountName ?? null,
      profileImageUrl: pp.socialAccount?.profileImageUrl ?? null,
      status: pp.status,
      captionOverride: pp.captionOverride,
      hashtagsOverride: pp.hashtagsOverride,
      titleOverride: pp.titleOverride,
      options: pp.options,
      platformPostId: pp.platformPostId,
      platformPostUrl: pp.platformPostUrl,
      errorCode: pp.errorCode,
      errorMessage: pp.errorMessage,
      attempts: pp.attempts,
      publishedAt: pp.publishedAt,
    })),
    reel: post.reel
      ? {
          script: post.reel.script,
          textOverlays: post.reel.textOverlays,
          voiceOverEnabled: post.reel.voiceOverEnabled,
          voiceOverText: post.reel.voiceOverText,
          voice: post.reel.voice,
          subtitlesEnabled: post.reel.subtitlesEnabled,
          subtitlesSrt: post.reel.subtitlesSrt,
          musicPreference: post.reel.musicPreference,
          durationSeconds: post.reel.durationSeconds,
          aiGenerationId: post.reel.aiGenerationId,
        }
      : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
