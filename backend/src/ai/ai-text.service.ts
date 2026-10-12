import { Inject, Injectable } from '@nestjs/common';
import { Brand } from '../brands/entities/brand.entity';
import { ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AiGenerationType, ContentType, SocialPlatform } from '../common/enums';
import { AiGenerationsService } from './ai-generations.service';
import {
  CampaignPlanBriefDto,
  GenerateCaptionDto,
  GenerateHashtagsDto,
  GenerateIdeasDto,
  GeneratePlatformContentDto,
  GenerateReelScriptDto,
} from './dto/ai.dto';
import { AI_TEXT_PROVIDER, AiTextProvider } from './providers/ai-provider.interfaces';
import { brandSystemPrompt, briefBlock, platformGuide } from './prompts/prompt-builder';

export interface CaptionResult { captions: { text: string; hook: string }[] }
export interface HashtagResult { hashtags: string[]; branded: string[]; niche: string[]; broad: string[] }
export interface IdeasResult { ideas: { title: string; description: string; format: string; hook: string }[] }
export interface ReelIdeasResult { ideas: { title: string; concept: string; hook: string; durationSeconds: number; shots: string[] }[] }
export interface ReelScriptResult {
  hook: string;
  mainContent: string;
  cta: string;
  ending: string;
  voiceOver: string;
  durationSeconds: number;
  textOverlays: { text: string; startSeconds: number; endSeconds: number }[];
  caption: string;
  hashtags: string[];
}
export type PlatformContentResult = Partial<Record<SocialPlatform, { caption: string; hashtags: string[]; title?: string; description?: string; tags?: string[] }>>;
export interface CampaignPlanResult {
  days: {
    day: number;
    theme: string;
    contentType: ContentType;
    title: string;
    caption: string;
    hashtags: string[];
    imagePrompt: string;
    platformCaptions: Partial<Record<SocialPlatform, string>>;
  }[];
}

const clean = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? [...new Set(tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean))]
    : [];

const requireArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderError(`AI response is missing "${field}"`, ErrorCode.AI_GENERATION_FAILED, true);
  }
  return value;
};

/** AI copywriting: captions, hashtags, ideas, reel scripts, platform variants and campaign plans. */
@Injectable()
export class AiTextService {
  constructor(
    @Inject(AI_TEXT_PROVIDER) private readonly provider: AiTextProvider,
    private readonly generations: AiGenerationsService,
  ) {}

  get providerInfo(): AiTextProvider {
    return this.provider;
  }

  async caption(userId: string, dto: GenerateCaptionDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.CAPTION, this.provider);
    const variants = dto.variants ?? 3;
    return this.generations.runSync<CaptionResult>(userId, ctx, AiGenerationType.CAPTION, this.provider, dto, async () => {
      const res = await this.complete<CaptionResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        dto.platform ? `Optimise for:\n${platformGuide([dto.platform])}` : 'Write platform-neutral social copy.',
        `Write ${variants} distinct caption variants (different angles/hooks). Do not include hashtags in the caption text.`,
        'JSON schema: {"captions":[{"hook":"first line","text":"full caption including the hook and a CTA"}]}',
      ]);
      requireArray(res.data.captions, 'captions');
      return res;
    });
  }

  async hashtags(userId: string, dto: GenerateHashtagsDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.HASHTAGS, this.provider);
    const count = dto.count ?? 20;
    return this.generations.runSync<HashtagResult>(userId, ctx, AiGenerationType.HASHTAGS, this.provider, dto, async () => {
      const res = await this.complete<HashtagResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        dto.caption ? `Caption:\n${dto.caption}` : '',
        dto.platform ? `Platform:\n${platformGuide([dto.platform])}` : '',
        `Suggest ${count} relevant hashtags mixing branded, niche and broad tags. No spaces, no "#" prefix.`,
        'JSON schema: {"hashtags":["all tags in recommended order"],"branded":[],"niche":[],"broad":[]}',
      ]);
      requireArray(res.data.hashtags, 'hashtags');
      return {
        tokensUsed: res.tokensUsed,
        data: {
          hashtags: clean(res.data.hashtags).slice(0, count),
          branded: clean(res.data.branded),
          niche: clean(res.data.niche),
          broad: clean(res.data.broad),
        },
      };
    });
  }

  async postIdeas(userId: string, dto: GenerateIdeasDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.POST_IDEAS, this.provider);
    return this.generations.runSync<IdeasResult>(userId, ctx, AiGenerationType.POST_IDEAS, this.provider, dto, async () => {
      const res = await this.complete<IdeasResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        `Generate ${dto.count ?? 5} varied social media post ideas (educational, promotional, behind-the-scenes, social proof, engagement...).`,
        'JSON schema: {"ideas":[{"title":"","description":"what the post shows/says","format":"image|carousel|video|reel","hook":"opening line"}]}',
      ]);
      requireArray(res.data.ideas, 'ideas');
      return res;
    });
  }

  async reelIdeas(userId: string, dto: GenerateIdeasDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.REEL_IDEAS, this.provider);
    return this.generations.runSync<ReelIdeasResult>(userId, ctx, AiGenerationType.REEL_IDEAS, this.provider, dto, async () => {
      const res = await this.complete<ReelIdeasResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        `Generate ${dto.count ?? 5} short-form vertical video (Reels/Shorts) concepts with a scroll-stopping hook in the first 2 seconds.`,
        'JSON schema: {"ideas":[{"title":"","concept":"","hook":"","durationSeconds":15,"shots":["shot 1","shot 2"]}]}',
      ]);
      requireArray(res.data.ideas, 'ideas');
      return res;
    });
  }

  async reelScript(userId: string, dto: GenerateReelScriptDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.REEL_SCRIPT, this.provider);
    const duration = dto.durationSeconds ?? 30;
    return this.generations.runSync<ReelScriptResult>(userId, ctx, AiGenerationType.REEL_SCRIPT, this.provider, dto, async () => {
      const res = await this.complete<ReelScriptResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        `Write a ${duration}-second vertical reel script. Structure: Hook (0-3s), Main content, CTA, Ending.`,
        'Text overlays must be short (max 6 words) with timings that fit the duration. voiceOver is the full narration.',
        'JSON schema: {"hook":"","mainContent":"","cta":"","ending":"","voiceOver":"","durationSeconds":30,"textOverlays":[{"text":"","startSeconds":0,"endSeconds":3}],"caption":"","hashtags":[]}',
      ]);
      if (!res.data.hook || !res.data.mainContent) {
        throw new ProviderError('AI response is missing the script', ErrorCode.AI_GENERATION_FAILED, true);
      }
      res.data.hashtags = clean(res.data.hashtags);
      res.data.textOverlays = Array.isArray(res.data.textOverlays) ? res.data.textOverlays : [];
      return res;
    });
  }

  async platformContent(userId: string, dto: GeneratePlatformContentDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.PLATFORM_CONTENT, this.provider);
    return this.generations.runSync<PlatformContentResult>(userId, ctx, AiGenerationType.PLATFORM_CONTENT, this.provider, dto, async () => {
      const res = await this.complete<PlatformContentResult>(ctx.brand, [
        briefBlock(ctx.brand, dto),
        dto.baseCaption ? `Base message to adapt:\n${dto.baseCaption}` : '',
        `Write a separate, natively optimised version for each platform. Do NOT reuse the same text across platforms.\n${platformGuide(dto.platforms)}`,
        `Return only these keys: ${dto.platforms.join(', ')}.`,
        'JSON schema: {"instagram":{"caption":"","hashtags":[]},"facebook":{"caption":"","hashtags":[]},"linkedin":{"caption":"","hashtags":[]},"youtube":{"title":"","description":"","tags":[],"caption":"","hashtags":[]}}',
      ]);
      const data: PlatformContentResult = {};
      for (const platform of dto.platforms) {
        const v = res.data[platform];
        if (!v) continue;
        data[platform] = {
          ...v,
          caption: v.caption ?? v.description ?? '',
          hashtags: clean(v.hashtags),
          ...(v.tags ? { tags: clean(v.tags) } : {}),
        };
      }
      if (Object.keys(data).length === 0) throw new ProviderError('AI response contained no platform content', ErrorCode.AI_GENERATION_FAILED, true);
      return { data, tokensUsed: res.tokensUsed };
    });
  }

  async campaignPlan(userId: string, brandId: string, dto: CampaignPlanBriefDto, days: number, platforms: SocialPlatform[]) {
    const ctx = await this.generations.prepare(userId, brandId, AiGenerationType.CAMPAIGN_PLAN, this.provider);
    return this.generations.runSync<CampaignPlanResult>(userId, ctx, AiGenerationType.CAMPAIGN_PLAN, this.provider, { ...dto, days, platforms }, async () => {
      const res = await this.complete<CampaignPlanResult>(
        ctx.brand,
        [
          briefBlock(ctx.brand, dto),
          `Plan a ${days}-day social media campaign with exactly one post per day for: ${platforms.join(', ')}.`,
          'Build a narrative arc, e.g. Day 1 Introduction, Educational, Product/service benefit, Customer problem, Offer, Reel, Final CTA (adapt to the number of days).',
          `Platform guidelines:\n${platformGuide(platforms)}`,
          'contentType must be one of: image, carousel, video, reel. imagePrompt describes the visual to create.',
          `JSON schema: {"days":[{"day":1,"theme":"Introduction","contentType":"image","title":"","caption":"","hashtags":[],"imagePrompt":"","platformCaptions":{${platforms.map((p) => `"${p}":""`).join(',')}}}]}`,
        ],
        4000,
      );
      const list = requireArray(res.data.days, 'days') as CampaignPlanResult['days'];
      const valid = new Set<string>(Object.values(ContentType));
      res.data.days = list.slice(0, days).map((d, i) => ({
        ...d,
        day: i + 1,
        contentType: valid.has(d.contentType) ? d.contentType : ContentType.IMAGE,
        hashtags: clean(d.hashtags),
        platformCaptions: d.platformCaptions ?? {},
      }));
      return res;
    });
  }

  /** Internal helper also used by the video storyboard step. */
  async complete<T>(brand: Brand, parts: string[], maxTokens?: number) {
    return this.provider.completeJson<T>({
      system: brandSystemPrompt(brand),
      user: parts.filter(Boolean).join('\n\n'),
      maxTokens,
    });
  }
}
