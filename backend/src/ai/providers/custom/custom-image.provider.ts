import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ProviderError } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { AiImageProvider, GeneratedImage, ImageAspect, ImageGenerationRequest } from '../ai-provider.interfaces';
import { CustomAiClient } from './custom.client';

const SIZES: Record<ImageAspect, string> = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

interface ImagesResponse {
  data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
}

/**
 * OpenAI-style /images/generations on a custom endpoint. Services differ in
 * whether they return base64 or a URL, so both are accepted. No edits endpoint,
 * so reference images (brand logo) are ignored.
 */
@Injectable()
export class CustomImageProvider implements AiImageProvider {
  readonly name = 'custom';

  constructor(
    private readonly client: CustomAiClient,
    private readonly settings: AiSettingsService,
  ) {}

  get model(): string {
    return this.settings.current().providers.custom.imageModel;
  }

  isConfigured(): boolean {
    return this.client.configured;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
    if (!this.model) throw new ProviderError('The custom AI provider has no image model set', ErrorCode.AI_PROVIDER_NOT_CONFIGURED);
    const response = await this.client.request<ImagesResponse>({
      method: 'POST',
      url: '/images/generations',
      data: { model: this.model, prompt: request.prompt, size: SIZES[request.aspect], n: request.count },
    });

    const images: GeneratedImage[] = [];
    for (const item of response.data ?? []) {
      let buffer: Buffer | null = null;
      if (item.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
      else if (item.url) buffer = Buffer.from((await axios.get<ArrayBuffer>(item.url, { responseType: 'arraybuffer', timeout: 60_000 })).data);
      if (buffer) images.push({ buffer, mimeType: sniffImageType(buffer), revisedPrompt: item.revised_prompt });
    }
    if (images.length === 0) throw new ProviderError('The image provider returned no images', ErrorCode.AI_GENERATION_FAILED, true);
    return images;
  }
}

/** PNG or JPEG by magic bytes (the only formats storage keys are named for). */
export function sniffImageType(buffer: Buffer): string {
  return buffer[0] === 0x89 && buffer[1] === 0x50 ? 'image/png' : 'image/jpeg';
}
