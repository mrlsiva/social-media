import { ContentType, SocialPlatform } from '../common/enums';
import { Post } from '../posts/entities/post.entity';
import { PostPlatform } from '../posts/entities/post-platform.entity';
import { ComposedContent } from './interfaces/social-publisher.interface';

const hasTag = (text: string, tag: string) => new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|$)`, 'i').test(text);

/**
 * Adapts a post to one platform: platform override caption/hashtags, CTA, mentions and
 * link handling differ per network (e.g. Instagram links are not clickable).
 */
export function composeContent(post: Post, pp: PostPlatform): ComposedContent {
  const platform = pp.platform;
  const caption = (pp.captionOverride ?? post.caption ?? '').trim();
  const hashtags = (pp.hashtagsOverride ?? post.hashtags ?? []).map((h) => h.replace(/^#+/, '')).filter(Boolean);
  const mentions = (post.mentions ?? []).map((m) => m.replace(/^@+/, '')).filter(Boolean);

  const blocks: string[] = [caption];

  if (post.cta && !caption.toLowerCase().includes(post.cta.toLowerCase())) blocks.push(post.cta);

  if (post.linkUrl && !caption.includes(post.linkUrl)) {
    // LinkedIn renders a link-preview card when there is no media; avoid duplicating it in text.
    const linkedInArticle = platform === SocialPlatform.LINKEDIN && (post.media?.length ?? 0) === 0;
    if (platform !== SocialPlatform.INSTAGRAM && !linkedInArticle) blocks.push(post.linkUrl);
    if (platform === SocialPlatform.INSTAGRAM) blocks.push('🔗 Link in bio');
  }

  if (mentions.length && (platform === SocialPlatform.INSTAGRAM || platform === SocialPlatform.FACEBOOK)) {
    const missing = mentions.filter((m) => !caption.includes(`@${m}`));
    if (missing.length) blocks.push(missing.map((m) => `@${m}`).join(' '));
  }

  let text = blocks.filter(Boolean).join('\n\n');

  // LinkedIn hashtags are formatted by its publisher; others get them appended to the text.
  if (platform !== SocialPlatform.LINKEDIN && platform !== SocialPlatform.YOUTUBE) {
    const missing = hashtags.filter((h) => !hasTag(text, h));
    if (missing.length) text = `${text}\n\n${missing.map((h) => `#${h}`).join(' ')}`.trim();
  }

  const isVideo = post.contentType === ContentType.VIDEO || post.contentType === ContentType.REEL;
  let title: string | null = pp.titleOverride ?? post.videoTitle ?? post.title ?? null;
  let description: string | null = null;

  if (platform === SocialPlatform.YOUTUBE) {
    title = (title ?? caption.split('\n')[0] ?? '').slice(0, 100) || null;
    const base = (post.videoDescription ?? text).trim();
    const tagLine = hashtags.filter((h) => !hasTag(base, h)).slice(0, 5).map((h) => `#${h}`).join(' ');
    description = [base, post.linkUrl && !base.includes(post.linkUrl) ? post.linkUrl : '', tagLine].filter(Boolean).join('\n\n');
    text = description;
  } else if (isVideo) {
    description = text;
  }

  return { text, hashtags, title, description, linkUrl: post.linkUrl };
}
