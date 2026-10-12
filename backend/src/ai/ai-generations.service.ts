import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BrandAccessService } from '../brands/brand-access.service';
import { Brand } from '../brands/entities/brand.entity';
import { PaginatedResult } from '../common/dto/paginated-result';
import { AppException, ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AiGenerationStatus, AiGenerationType, BrandRole, UsageMetric } from '../common/enums';
import { UsageService } from '../subscriptions/usage.service';
import { AiGenerationQueryDto } from './dto/ai.dto';
import { AiGeneration } from './entities/ai-generation.entity';
import { AiProviderInfo } from './providers/ai-provider.interfaces';

export const USAGE_METRIC_FOR: Record<AiGenerationType, UsageMetric> = {
  [AiGenerationType.CAPTION]: UsageMetric.AI_CAPTION,
  [AiGenerationType.HASHTAGS]: UsageMetric.AI_HASHTAGS,
  [AiGenerationType.POST_IDEAS]: UsageMetric.AI_CAPTION,
  [AiGenerationType.REEL_IDEAS]: UsageMetric.AI_CAPTION,
  [AiGenerationType.REEL_SCRIPT]: UsageMetric.AI_CAPTION,
  [AiGenerationType.PLATFORM_CONTENT]: UsageMetric.AI_CAPTION,
  [AiGenerationType.CAMPAIGN_PLAN]: UsageMetric.AI_CAPTION,
  [AiGenerationType.IMAGE]: UsageMetric.AI_IMAGE,
  [AiGenerationType.VIDEO]: UsageMetric.AI_VIDEO,
};

export interface GenerationContext {
  brand: Brand;
  accountId: string;
}

/**
 * Bookkeeping for AI requests: brand access, quota checks, usage counters and
 * the ai_generations history table.
 */
@Injectable()
export class AiGenerationsService {
  private readonly logger = new Logger(AiGenerationsService.name);

  constructor(
    @InjectRepository(AiGeneration) private readonly repo: Repository<AiGeneration>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    private readonly access: BrandAccessService,
    private readonly usage: UsageService,
  ) {}

  /** Verifies access + quota and loads the brand with settings. */
  async prepare(userId: string, brandId: string, type: AiGenerationType, provider: AiProviderInfo): Promise<GenerationContext> {
    const { brand } = await this.access.assert(userId, brandId, BrandRole.EDITOR);
    if (!provider.isConfigured()) {
      throw new AppException(
        ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        `The AI provider "${provider.name}" is not configured. An admin can add its API key in Admin > AI providers.`,
        503,
      );
    }
    await this.usage.assertAiQuota(brand.ownerId, USAGE_METRIC_FOR[type]);
    const full = await this.brands.findOneOrFail({ where: { id: brandId }, relations: { settings: true } });
    return { brand: full, accountId: brand.ownerId };
  }

  /** Runs a synchronous generation, recording history and usage. */
  async runSync<T>(
    userId: string,
    ctx: GenerationContext,
    type: AiGenerationType,
    provider: AiProviderInfo,
    input: object,
    fn: () => Promise<{ data: T; tokensUsed: number | null }>,
  ): Promise<{ generationId: string; result: T }> {
    const record = await this.repo.save(
      this.repo.create({
        userId,
        accountId: ctx.accountId,
        brandId: ctx.brand.id,
        type,
        provider: provider.name,
        model: provider.model,
        status: AiGenerationStatus.PROCESSING,
        input: { ...input },
      }),
    );
    try {
      const { data, tokensUsed } = await fn();
      await this.repo.save({ ...record, status: AiGenerationStatus.COMPLETED, output: data as object, tokensUsed, completedAt: new Date() });
      await this.usage.recordAiUsage(ctx.accountId, USAGE_METRIC_FOR[type]);
      return { generationId: record.id, result: data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI generation failed';
      await this.repo.save({ ...record, status: AiGenerationStatus.FAILED, errorMessage: message, completedAt: new Date() });
      this.logger.warn({ err: message, type, generationId: record.id }, 'AI generation failed');
      if (err instanceof AppException) throw err;
      throw new AppException(
        err instanceof ProviderError ? err.code : ErrorCode.AI_GENERATION_FAILED,
        'AI generation failed. Please try again.',
        502,
        { reason: message },
      );
    }
  }

  /** Creates a pending record for async (queued) generations and reserves quota. */
  async createPending(userId: string, ctx: GenerationContext, type: AiGenerationType, provider: AiProviderInfo, input: object): Promise<AiGeneration> {
    const record = await this.repo.save(
      this.repo.create({
        userId,
        accountId: ctx.accountId,
        brandId: ctx.brand.id,
        type,
        provider: provider.name,
        model: provider.model,
        status: AiGenerationStatus.PENDING,
        input: { ...input },
        progress: 0,
      }),
    );
    await this.usage.recordAiUsage(ctx.accountId, USAGE_METRIC_FOR[type]);
    return record;
  }

  async markProcessing(id: string, patch: Partial<Pick<AiGeneration, 'externalJobId' | 'progress' | 'output'>> = {}): Promise<void> {
    const record = await this.repo.findOneByOrFail({ id });
    await this.repo.save({ ...record, ...patch, status: AiGenerationStatus.PROCESSING });
  }

  async complete(id: string, output: object, resultMediaId?: string | null): Promise<AiGeneration> {
    const record = await this.repo.findOneByOrFail({ id });
    return this.repo.save({ ...record, status: AiGenerationStatus.COMPLETED, output, progress: 100, resultMediaId: resultMediaId ?? record.resultMediaId, completedAt: new Date() });
  }

  /** Marks failure and refunds the reserved quota. */
  async fail(id: string, message: string): Promise<AiGeneration> {
    const record = await this.repo.findOneByOrFail({ id });
    if (record.status !== AiGenerationStatus.FAILED) {
      await this.usage.recordAiUsage(record.accountId, USAGE_METRIC_FOR[record.type], -1);
    }
    return this.repo.save({ ...record, status: AiGenerationStatus.FAILED, errorMessage: message.slice(0, 2000), completedAt: new Date() });
  }

  findById(id: string): Promise<AiGeneration | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getForUser(userId: string, id: string, types?: AiGenerationType[]): Promise<AiGeneration> {
    const record = await this.repo.findOne({ where: { id, ...(types ? { type: In(types) } : {}) } });
    if (!record) throw AppException.notFound(ErrorCode.AI_JOB_NOT_FOUND, 'AI generation not found');
    if (record.brandId) {
      await this.access.assert(userId, record.brandId).catch(() => {
        throw AppException.notFound(ErrorCode.AI_JOB_NOT_FOUND, 'AI generation not found');
      });
    } else if (record.userId !== userId) {
      throw AppException.notFound(ErrorCode.AI_JOB_NOT_FOUND, 'AI generation not found');
    }
    return record;
  }

  async list(userId: string, query: AiGenerationQueryDto): Promise<PaginatedResult<AiGeneration>> {
    const brandIds = query.brandId ? [query.brandId] : await this.access.accessibleBrandIds(userId);
    if (query.brandId) await this.access.assert(userId, query.brandId);
    if (brandIds.length === 0) return new PaginatedResult([], 0, query.page, query.limit);
    const [items, total] = await this.repo.findAndCount({
      where: {
        brandId: In(brandIds),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { createdAt: query.order },
      skip: query.skip,
      take: query.limit,
    });
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async monthlyCount(accountId: string): Promise<number> {
    return this.usage.getUsage(accountId, UsageMetric.AI_GENERATIONS);
  }
}
