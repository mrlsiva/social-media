import { Brand } from '../../brands/entities/brand.entity';
import { SocialPlatform } from '../../common/enums';
import { AiBriefDto } from '../dto/ai.dto';

/** Platform writing guidelines - the reason captions are never blindly duplicated. */
export const PLATFORM_GUIDELINES: Record<string, string> = {
  [SocialPlatform.INSTAGRAM]:
    'Instagram: visual-first, strong first line hook (shown before "more"), short paragraphs, emojis allowed, max 2200 chars, links are NOT clickable (say "link in bio"), up to 30 hashtags but 5-15 relevant ones perform best.',
  [SocialPlatform.FACEBOOK]:
    'Facebook: conversational, community-oriented, 1-3 short paragraphs, links are clickable, few hashtags (0-3), ask a question to drive comments.',
  [SocialPlatform.LINKEDIN]:
    'LinkedIn: professional and insight-led, start with a compelling one-line hook, use line breaks, share value/lessons, minimal emojis, 3-5 hashtags at the end, max 3000 chars.',
  [SocialPlatform.YOUTUBE]:
    'YouTube: SEO-friendly title under 70 characters (max 100), description whose first 150 characters summarise the value, include keywords, CTA to subscribe, 3-5 hashtags; tags are keywords without #.',
};

export interface BrandContext {
  brand: Brand;
}

/** System prompt that grounds every generation in the selected brand. */
export function brandSystemPrompt(brand: Brand): string {
  const s = brand.settings;
  const ai = s?.aiSettings ?? {};
  const lines = [
    'You are an expert social media strategist and copywriter for small and medium businesses.',
    'Always answer with a single valid JSON object that matches the requested schema. No markdown, no commentary.',
    'Never invent facts, prices, statistics or claims that were not provided. Use placeholders like [price] when unknown.',
    '',
    `BRAND: ${brand.name}`,
    brand.description ? `About: ${brand.description}` : '',
    brand.website ? `Website: ${brand.website}` : '',
    brand.phone ? `Phone: ${brand.phone}` : '',
    ai.brandVoice ? `Brand voice: ${ai.brandVoice}` : '',
    ai.keywords?.length ? `Preferred keywords: ${ai.keywords.join(', ')}` : '',
    ai.avoidWords?.length ? `Never use these words/phrases: ${ai.avoidWords.join(', ')}` : '',
    ai.emojiLevel ? `Emoji usage: ${ai.emojiLevel}` : '',
    s?.defaultCta ? `Default call to action: ${s.defaultCta}` : '',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/** Renders the shared brief, falling back to brand defaults. */
export function briefBlock(brand: Brand, brief: Partial<AiBriefDto>): string {
  const s = brand.settings;
  const lines = [
    `Language: ${brief.language ?? s?.defaultLanguage ?? 'en'} (write ALL text in this language)`,
    `Tone: ${brief.tone ?? s?.defaultTone ?? 'professional'}`,
    brief.contentType ? `Content type: ${brief.contentType}` : '',
    brief.topic ? `Topic: ${brief.topic}` : '',
    brief.productService ? `Product/service: ${brief.productService}` : '',
    brief.targetAudience ? `Target audience: ${brief.targetAudience}` : '',
    brief.objective ? `Objective: ${brief.objective}` : '',
    brief.offer ? `Offer: ${brief.offer}` : '',
    brief.additionalInstructions ? `Additional instructions: ${brief.additionalInstructions}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function platformGuide(platforms: string[]): string {
  return platforms.map((p) => `- ${PLATFORM_GUIDELINES[p] ?? p}`).join('\n');
}
