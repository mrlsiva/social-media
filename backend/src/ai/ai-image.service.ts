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
import { Media } from '../media/entities/media.entity';
import { MediaService } from '../media/media.service';
import { StorageService } from '../media/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiGenerationsService } from './ai-generations.service';
import { GenerateImageDto, SaveGenerationDto } from './dto/ai.dto';
import { AiGeneration } from './entities/ai-generation.entity';
import { AI_IMAGE_PROVIDER, AiImageProvider } from './providers/ai-provider.interfaces';
import { withQueueTimeout } from '../common/utils/queue';

export interface GeneratedImageOutput {
  prompt: string;
  images: { url: string; key: string; revisedPrompt?: string; mediaId?: string }[];
}

/**
 * AIImageService - provider-agnostic image generation.
 * Generation runs in the background queue; clients poll GET /ai/images/:id.
 */
@Injectable()
export class AIImageService {
  private readonly logger = new Logger(AIImageService.name);

  constructor(
    @Inject(AI_IMAGE_PROVIDER) private readonly provider: AiImageProvider,
    @InjectQueue(QUEUES.AI) private readonly queue: Queue,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    private readonly generations: AiGenerationsService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  get providerInfo() {
    return this.provider;
  }

  async request(userId: string, dto: GenerateImageDto) {
    const ctx = await this.generations.prepare(userId, dto.brandId, AiGenerationType.IMAGE, this.provider);
    const record = await this.generations.createPending(userId, ctx, AiGenerationType.IMAGE, this.provider, dto);
    try {
      await withQueueTimeout(this.queue.add(JOBS.AI_IMAGE, { generationId: record.id }, { jobId: record.id, attempts: 2, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 500, removeOnFail: 1000 }));
    } catch {
      await this.generations.fail(record.id, 'Background queue unavailable');
      throw new AppException(ErrorCode.AI_GENERATION_FAILED, 'Background job queue is unavailable (is Redis running?)', 503);
    }
    return { jobId: record.id, status: 'processing' as const };
  }

  async regenerate(userId: string, generationId: string) {
    const previous = await this.generations.getForUser(userId, generationId, [AiGenerationType.IMAGE]);
    return this.request(userId, previous.input as unknown as GenerateImageDto);
  }

  async status(userId: string, generationId: string) {
    const record = await this.generations.getForUser(userId, generationId, [AiGenerationType.IMAGE]);
    return this.toStatus(record);
  }

  toStatus(record: AiGeneration) {
    const output = record.output as GeneratedImageOutput | null;
    return {
      jobId: record.id,
      status: record.status === AiGenerationStatus.PENDING ? AiGenerationStatus.PROCESSING : record.status,
      images: (output?.images ?? []).map((i, index) => ({ index, url: i.url, mediaId: i.mediaId ?? null })),
      prompt: output?.prompt ?? null,
      error: record.errorMessage,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }

  /** Worker entry point. */
  async process(generationId: string, isFinalAttempt: boolean): Promise<void> {
    const record = await this.generations.findById(generationId);
    if (!record || record.status === AiGenerationStatus.COMPLETED || record.status === AiGenerationStatus.FAILED) return;
    const input = record.input as unknown as GenerateImageDto;
    await this.generations.markProcessing(generationId, { progress: 10 });

    try {
      const brand = await this.brands.findOneOrFail({ where: { id: record.brandId! }, relations: { settings: true } });
      const prompt = this.buildPrompt(brand, input);
      const referenceImages = await this.logoReference(brand, input);
      const images = await this.provider.generate({
        prompt: referenceImages.length ? `${prompt}\nUse the provided image as the brand logo; reproduce it faithfully and do not alter it.` : prompt,
        aspect: input.size ?? 'square',
        count: input.count ?? 1,
        referenceImages,
      });

      const stored: GeneratedImageOutput['images'] = [];
      for (const [i, img] of images.entries()) {
        const key = `brands/${brand.id}/ai-generated/${generationId}-${i}.${img.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`; // providers only return PNG or JPEG
        await this.storage.putBuffer(img.buffer, key, img.mimeType);
        stored.push({ url: this.storage.getPublicUrl(key), key, revisedPrompt: img.revisedPrompt });
      }
      await this.generations.complete(generationId, { prompt, images: stored } satisfies GeneratedImageOutput);
      await this.notifications.notify({
        userId: record.userId,
        brandId: record.brandId,
        type: NotificationType.AI_GENERATION_COMPLETED,
        title: 'Your AI image is ready',
        body: input.topic,
        data: { generationId, type: 'image' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image generation failed';
      this.logger.warn({ err: message, generationId }, 'AI image generation attempt failed');
      if (!isFinalAttempt) throw err;
      await this.generations.fail(generationId, message);
    }
  }

  /** Copies generated images into the brand media library ("Save to Media Library" / "Use in Post"). */
  async saveToLibrary(userId: string, generationId: string, dto: SaveGenerationDto): Promise<Media[]> {
    const record = await this.generations.getForUser(userId, generationId, [AiGenerationType.IMAGE]);
    if (record.status !== AiGenerationStatus.COMPLETED) {
      throw new AppException(ErrorCode.AI_GENERATION_FAILED, 'The image is not ready yet');
    }
    const output = record.output as GeneratedImageOutput;
    const indexes = dto.index !== undefined ? [dto.index] : output.images.map((_, i) => i);
    const saved: Media[] = [];
    for (const index of indexes) {
      const image = output.images[index];
      if (!image) throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, `Generated image #${index} does not exist`);
      if (image.mediaId) {
        saved.push(await this.media.get(userId, image.mediaId));
        continue;
      }
      const media = await this.media.saveGenerated({
        brandId: record.brandId!,
        userId,
        buffer: await this.storage.read(image.key),
        mimeType: image.key.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
        type: MediaType.IMAGE,
        source: MediaSource.AI_IMAGE,
        name: dto.name ?? `AI - ${String((record.input as { topic?: string }).topic ?? 'image').slice(0, 200)}`,
        aiGenerationId: record.id,
        folderId: dto.folderId ?? null,
      });
      image.mediaId = media.id;
      saved.push(media);
    }
    await this.generations.complete(record.id, output, saved[0]?.id ?? null);
    return saved;
  }

  private buildPrompt(brand: Brand, input: GenerateImageDto): string {
    const useColors = input.useBrandColors ?? true;
    const lines = [
      'Create a high-quality, professional social media marketing image.',
      `Subject/topic: ${input.topic}.`,
      input.description ? `Scene details: ${input.description}.` : '',
      `Visual style: ${input.style ?? 'modern, clean, premium commercial design'}.`,
      useColors ? `Use the brand colour palette: primary ${brand.primaryColor}, secondary ${brand.secondaryColor}.` : '',
      (input.includeBrandName ?? true) ? `Display the brand name "${brand.name}" clearly.` : '',
      input.offer ? `Feature the offer text "${input.offer}" prominently.` : '',
      input.cta ? `Include a call-to-action button or label reading "${input.cta}".` : '',
      input.includeWebsite && brand.website ? `Show the website "${brand.website.replace(/^https?:\/\//, '')}" in small text.` : '',
      `Any text in the image must be in ${input.language ?? brand.settings?.defaultLanguage ?? 'English'}, spelled correctly, short and highly legible.`,
      'Leave comfortable margins; no watermarks; no fake UI chrome.',
    ];
    return lines.filter(Boolean).join(' ');
  }

  private async logoReference(brand: Brand, input: GenerateImageDto) {
    const useLogo = input.useLogo ?? brand.settings?.aiSettings?.useBrandingInImages ?? true;
    if (!useLogo || !brand.logoMediaId) return [];
    const logo = await this.media.findByIdUnsafe(brand.logoMediaId);
    if (!logo || !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType)) return [];
    try {
      return [{ buffer: await this.storage.read(logo.storageKey), mimeType: logo.mimeType, filename: `logo.${logo.extension}` }];
    } catch {
      return [];
    }
  }
}
