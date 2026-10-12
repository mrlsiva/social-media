import { Injectable } from '@nestjs/common';
import { ProviderError } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AiImageProvider, GeneratedImage, ImageAspect, ImageGenerationRequest } from '../ai-provider.interfaces';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { sniffImageType } from '../custom/custom-image.provider';
import { NvidiaClient } from './nvidia.client';

/** FLUX on NVIDIA accepts 768-1344px sides in steps of 64. */
const SIZES: Record<ImageAspect, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 832, height: 1216 },
  landscape: { width: 1216, height: 832 },
};

interface GenAiResponse {
  artifacts?: { base64?: string; finishReason?: string }[];
}

/**
 * NVIDIA-hosted text-to-image (FLUX by default). It renders one image per
 * request and has no edit endpoint, so reference images (brand logo) are ignored.
 */
@Injectable()
export class NvidiaImageProvider implements AiImageProvider {
  readonly name = 'nvidia';

  constructor(
    private readonly client: NvidiaClient,
    private readonly settings: AiSettingsService,
  ) {}

  get model(): string {
    return this.settings.current().providers.nvidia.imageModel;
  }

  isConfigured(): boolean {
    return this.client.configured;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
    const { width, height } = SIZES[request.aspect];
    const images: GeneratedImage[] = [];
    for (let i = 0; i < request.count; i++) {
      const response = await this.client.request<GenAiResponse>({
        method: 'POST',
        url: `https://ai.api.nvidia.com/v1/genai/${this.model}`,
        data: { prompt: request.prompt, mode: 'base', width, height, cfg_scale: 3.5, steps: 50, seed: 0 },
      });
      const artifact = response.artifacts?.find((a) => a.base64);
      if (artifact?.finishReason === 'CONTENT_FILTERED') {
        throw new ProviderError('The image was blocked by the provider content filter', ErrorCode.AI_GENERATION_FAILED, false);
      }
      if (artifact?.base64) {
        const buffer = Buffer.from(artifact.base64, 'base64');
        images.push({ buffer, mimeType: sniffImageType(buffer) });
      }
    }
    if (images.length === 0) throw new ProviderError('The image provider returned no images', ErrorCode.AI_GENERATION_FAILED, true);
    return images;
  }
}
