import { ContentType, SocialPlatform } from '../common/enums';
import { composeContent } from './content-composer';
import { buildCommentary } from './linkedin/linkedin.publisher';

const post = (over: Record<string, unknown> = {}) =>
  ({
    caption: 'Light up your business this Diwali!',
    hashtags: ['diwali', 'billing'],
    mentions: ['slinggroups'],
    cta: 'Book a demo',
    linkUrl: 'https://slinggroups.com/diwali',
    contentType: ContentType.IMAGE,
    media: [{}],
    title: 'Diwali offer',
    videoTitle: null,
    videoDescription: null,
    ...over,
  }) as never;

const pp = (platform: SocialPlatform, over: Record<string, unknown> = {}) =>
  ({ platform, captionOverride: null, hashtagsOverride: null, titleOverride: null, ...over }) as never;

describe('composeContent', () => {
  it('Instagram: no clickable link, "link in bio", hashtags and mentions appended', () => {
    const c = composeContent(post(), pp(SocialPlatform.INSTAGRAM));
    expect(c.text).not.toContain('https://');
    expect(c.text).toContain('Link in bio');
    expect(c.text).toContain('#diwali #billing');
    expect(c.text).toContain('@slinggroups');
  });

  it('Facebook: keeps the clickable link', () => {
    expect(composeContent(post(), pp(SocialPlatform.FACEBOOK)).text).toContain('https://slinggroups.com/diwali');
  });

  it('uses the platform-specific caption and hashtags overrides', () => {
    const c = composeContent(post(), pp(SocialPlatform.LINKEDIN, { captionOverride: 'Professional version', hashtagsOverride: ['smallbusiness'] }));
    expect(c.text.startsWith('Professional version')).toBe(true);
    expect(c.hashtags).toEqual(['smallbusiness']);
    // LinkedIn hashtags are formatted by its publisher, not appended as plain text.
    expect(c.text).not.toContain('#smallbusiness');
  });

  it('YouTube: builds a title (<=100 chars) and a description with the link', () => {
    const c = composeContent(post({ contentType: ContentType.VIDEO, title: 'x'.repeat(150) }), pp(SocialPlatform.YOUTUBE));
    expect(c.title!.length).toBeLessThanOrEqual(100);
    expect(c.description).toContain('https://slinggroups.com/diwali');
  });
});

describe('LinkedIn commentary', () => {
  it('escapes reserved characters and formats hashtags', () => {
    const text = buildCommentary('Save 30% (today) on #billing_tools!', ['diwali', 'billing_tools']);
    expect(text).toContain('\\(today\\)');
    expect(text).toContain('{hashtag|\\#|billing_tools}');
    expect(text).toContain('{hashtag|\\#|diwali}');
    // inline hashtag is not duplicated
    expect(text.match(/billing_tools/g)).toHaveLength(1);
  });
});
