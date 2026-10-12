import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AiGenerationStatus, AiGenerationType, MediaSource, MediaType, NotificationType } from '../common/enums';
import { JOBS, QUEUES } from '../common/queues';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiGenerationsService } from './ai-generations.service';
import { AiTextService } from './ai-text.service';
import { GenerateVideoDto } from './dto/ai.dto';
import { AiGeneration } from './entities/ai-generation.entity';
import { AI_VIDEO_PROVIDER, AiVideoProvider } from './providers/ai-provider.interfaces';
import { withQueueTimeout } from '../common/utils/queue';

export interface VideoStoryboard {
  scenes: { startSeconds: number; endSeconds: number; visual: string; camera?: string }[];
  textOverlays: { text: string; startSeconds: number; endSeconds: number }[];
  voiceOver: string;
  subtitles: { startSeconds: number; endSeconds: number; text: string }[];
  music: string;
  cta: string;
  caption?: string;
  hashtags?: string[];
}

export interface VideoOutput {
  storyboard?: VideoStoryboard;
  subtitlesSrt?: string;
  prompt?: string;
  durationSeconds?: number;
  videoUrl?: string;
  mediaId?: string;
}

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 120; // ~30 minutes

/**
 * AIVideoService - asynchronous AI reel/video generation behind a provider interface.
 * Pipeline (BullMQ): storyboard (text AI) -> provider render job -> poll -> store in media library.
 * HTTP requests never wait for rendering.
 */
@Injectable()
export class AIVideoService {
  private readonly logger = new Logger(AIVideoService.name);

  constructor(
    @Inject(AI_VIDEO_PROVIDER) private readonly provider: AiVideoProvider,
    @InjectQueue(QUEUES.AI) private readonly queue: Queue,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    private readonly generations: AiGenerationsService,
    private readonly text: AiTextService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  get providerInfo() {
    return this.provider;
  }

  async request(userId: string, dto: GenerateVideoDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.VIDEO, this.provider);
    const record = await this.generations.createPending(userId, ctx, AiGenerationType.VIDEO, this.provider, dto);
    try {
      await withQueueTimeout(this.queue.add(JOBS.AI_VIDEO_START, { generationId: record.id }, { jobId: `video-start_${record.id}`, attempts: 3, backoff: { type: 'exponential', delay: 15_000 }, removeOnComplete: 500, removeOnFail: 1000 }));
    } catch {
      await this.generations.fail(record.id, 'Background queue unavailable');
      throw new AppException(ErrorCode.AI_GENERATION_FAILED, 'Background job queue is unavailable (is Redis running?)', 503);
    }
    return { jobId: record.id, status: 'processing' as const };
  }

  async status(userId: string, generationId: string) {
    return this.toStatus(await this.generations.getForUser(userId, generationId, [AiGenerationType.VIDEO]));
  }

  toStatus(record: AiGeneration) {
    const output = (record.output ?? {}) as VideoOutput;
    return {
      jobId: record.id,
      status: record.status === AiGenerationStatus.PENDING ? AiGenerationStatus.PROCESSING : record.status,
      progress: record.progress,
      videoUrl: output.videoUrl ?? null,
      mediaId: output.mediaId ?? record.resultMediaId ?? null,
      durationSeconds: output.durationSeconds ?? null,
      storyboard: output.storyboard ?? null,
      subtitlesSrt: output.subtitlesSrt ?? null,
      error: record.errorMessage,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }

  /** Step 1: storyboard + submit render job. */
  async start(generationId: string, isFinalAttempt: boolean): Promise<void> {
    const record = await this.generations.findById(generationId);
    if (!record || record.status !== AiGenerationStatus.PENDING) return;
    const input = record.input as unknown as GenerateVideoDto;
    try {
      const brand = await this.brands.findOneOrFail({ where: { id: record.brandId! }, relations: { settings: true } });
      const seconds = this.snapDuration(input.durationSeconds ?? 8);
      const storyboard = await this.buildStoryboard(brand, input, seconds);
      const prompt = this.composePrompt(brand, input, storyboard, seconds);
      const { externalJobId } = await this.provider.start({ prompt, seconds, aspect: input.aspect ?? 'portrait' });

      await this.generations.markProcessing(generationId, {
        externalJobId,
        progress: 5,
        output: {
          storyboard: storyboard ?? undefined,
          subtitlesSrt: storyboard && input.subtitles !== false ? toSrt(storyboard.subtitles) : undefined,
          prompt,
          durationSeconds: seconds,
        } satisfies VideoOutput,
      });
      await this.schedulePoll(generationId, 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video generation failed';
      this.logger.warn({ err: message, generationId }, 'AI video start failed');
      if (!isFinalAttempt) throw err;
      await this.failAndNotify(record, message);
    }
  }

  /** Step 2: poll the provider until the render finishes. */
  async poll(generationId: string, attempt: number): Promise<void> {
    const record = await this.generations.findById(generationId);
    if (!record || record.status !== AiGenerationStatus.PROCESSING || !record.externalJobId) return;

    let status;
    try {
      status = await this.provider.getStatus(record.externalJobId);
    } catch (err) {
      // Transient provider error: keep polling until the attempt budget runs out.
      if (attempt >= MAX_POLLS) return this.failAndNotify(record, 'Video generation timed out');
      this.logger.warn({ err: (err as Error).message, generationId }, 'Video status check failed; will retry');
      return this.schedulePoll(generationId, attempt + 1);
    }

    if (status.status === 'failed') return this.failAndNotify(record, status.error ?? 'The video provider failed to render the video');

    if (status.status === 'completed') {
      const { buffer, mimeType } = await this.provider.download(record.externalJobId);
      const input = record.input as unknown as GenerateVideoDto;
      const media = await this.media.saveGenerated({
        brandId: record.brandId!,
        userId: record.userId,
        buffer,
        mimeType,
        type: MediaType.VIDEO,
        source: MediaSource.AI_VIDEO,
        name: `AI Reel - ${input.topic}`.slice(0, 255),
        aiGenerationId: record.id,
      });
      const output = { ...((record.output ?? {}) as VideoOutput), videoUrl: media.url, mediaId: media.id };
      await this.media.updateProbe(media.id, { durationSeconds: output.durationSeconds });
      await this.generations.complete(record.id, output, media.id);
      await this.notifications.notify({
        userId: record.userId,
        brandId: record.brandId,
        type: NotificationType.VIDEO_GENERATION_COMPLETED,
        title: 'Your AI video is ready',
        body: input.topic,
        data: { generationId: record.id, mediaId: media.id },
      });
      return;
    }

    if (attempt >= MAX_POLLS) return this.failAndNotify(record, 'Video generation timed out');
    await this.generations.markProcessing(record.id, { progress: status.progress ?? record.progress ?? 10 });
    await this.schedulePoll(generationId, attempt + 1);
  }

  private async schedulePoll(generationId: string, attempt: number): Promise<void> {
    await withQueueTimeout(this.queue.add(
      JOBS.AI_VIDEO_POLL,
      { generationId, attempt },
      { jobId: `video-poll_${generationId}_${attempt}`, delay: POLL_INTERVAL_MS, removeOnComplete: 100, removeOnFail: 500 },
    ));
  }

  private async failAndNotify(record: AiGeneration, message: string): Promise<void> {
    await this.generations.fail(record.id, message);
    await this.notifications.notify({
      userId: record.userId,
      brandId: record.brandId,
      type: NotificationType.VIDEO_GENERATION_COMPLETED,
      title: 'AI video generation failed',
      body: message.slice(0, 500),
      data: { generationId: record.id, failed: true },
    });
  }

  private snapDuration(requested: number): number {
    return this.provider.supportedDurations.reduce((best, d) => (Math.abs(d - requested) < Math.abs(best - requested) ? d : best));
  }

  /** Uses the text AI to plan scenes, overlays, voice-over and subtitles. Optional if no text provider. */
  private async buildStoryboard(brand: Brand, input: GenerateVideoDto, seconds: number): Promise<VideoStoryboard | null> {
    if (!this.text.providerInfo.isConfigured()) return null;
    const { data } = await this.text.complete<VideoStoryboard>(brand, [
      `Plan a ${seconds}-second ${input.aspect ?? 'portrait'} promotional video.`,
      `Topic: ${input.topic}`,
      input.productService ? `Product/service: ${input.productService}` : '',
      `Style: ${input.style ?? 'modern commercial'}`,
      `Language for voice-over, overlays and subtitles: ${input.language ?? brand.settings?.defaultLanguage ?? 'en'}`,
      input.voice ? `Voice: ${input.voice}` : '',
      input.musicPreference ? `Music: ${input.musicPreference}` : '',
      `CTA: ${input.cta ?? brand.settings?.defaultCta ?? 'Visit us today'}`,
      'Scenes must cover the full duration without gaps. Subtitles follow the voice-over timing.',
      'JSON schema: {"scenes":[{"startSeconds":0,"endSeconds":3,"visual":"","camera":""}],"textOverlays":[{"text":"","startSeconds":0,"endSeconds":2}],"voiceOver":"","subtitles":[{"startSeconds":0,"endSeconds":2,"text":""}],"music":"","cta":"","caption":"","hashtags":[]}',
    ]);
    return {
      scenes: Array.isArray(data.scenes) ? data.scenes : [],
      textOverlays: Array.isArray(data.textOverlays) ? data.textOverlays : [],
      voiceOver: data.voiceOver ?? '',
      subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
      music: data.music ?? input.musicPreference ?? '',
      cta: data.cta ?? input.cta ?? '',
      caption: data.caption,
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
    };
  }

  private composePrompt(brand: Brand, input: GenerateVideoDto, storyboard: VideoStoryboard | null, seconds: number): string {
    const parts = [
      `A ${seconds}-second ${input.aspect === 'landscape' ? 'horizontal 16:9' : 'vertical 9:16'} social media video for the brand "${brand.name}".`,
      `Topic: ${input.topic}.`,
      input.productService ? `Featuring: ${input.productService}.` : '',
      `Style: ${input.style ?? 'modern, polished commercial look'}; brand colours ${brand.primaryColor} and ${brand.secondaryColor}.`,
    ];
    if (storyboard) {
      parts.push(
        'Shot list: ' + storyboard.scenes.map((s) => `[${s.startSeconds}-${s.endSeconds}s] ${s.visual}${s.camera ? ` (${s.camera})` : ''}`).join(' '),
        storyboard.voiceOver ? `Narration${input.voice ? ` (${input.voice})` : ''}: "${storyboard.voiceOver}"` : '',
        storyboard.music ? `Background music: ${storyboard.music}.` : '',
        storyboard.textOverlays.length ? 'On-screen text: ' + storyboard.textOverlays.map((t) => `"${t.text}" (${t.startSeconds}-${t.endSeconds}s)`).join(', ') : '',
        storyboard.cta ? `End with the call to action "${storyboard.cta}".` : '',
      );
    } else {
      parts.push(
        input.voice ? `Narrator voice: ${input.voice}.` : '',
        input.musicPreference ? `Background music: ${input.musicPreference}.` : '',
        input.cta ? `End with the call to action "${input.cta}".` : '',
      );
    }
    return parts.filter(Boolean).join(' ').slice(0, 4000);
  }
}

/** Converts timed subtitle lines into SRT. */
export function toSrt(lines: { startSeconds: number; endSeconds: number; text: string }[]): string {
  const ts = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
    const sec = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
  };
  return lines.map((l, i) => `${i + 1}\n${ts(l.startSeconds)} --> ${ts(l.endSeconds)}\n${l.text}\n`).join('\n');
}
