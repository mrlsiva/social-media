import { Injectable } from '@nestjs/common';
import { ProviderError } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AiImageProvider, GeneratedImage, ImageAspect, ImageGenerationRequest } from '../ai-provider.interfaces';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { OpenAiClient } from './openai.client';

const SIZES: Record<ImageAspect, string> = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

interface ImagesResponse {
  data: { b64_json?: string; revised_prompt?: string }[];
}

/**
 * OpenAI GPT Image provider. With reference images (brand logo) it uses the
 * edits endpoint so the model can place the real logo into the design.
 */
@Injectable()
export class OpenAiImageProvider implements AiImageProvider {
  readonly name = 'openai';

  constructor(
    private readonly client: OpenAiClient,
    private readonly settings: AiSettingsService,
  ) {}

  get model(): string {
    return this.settings.current().providers.openai.imageModel;
  }

  isConfigured(): boolean {
    return this.client.configured;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
    const size = SIZES[request.aspect];
    let response: ImagesResponse;

    if (request.referenceImages?.length) {
      const form = new FormData();
      form.append('model', this.model);
      form.append('prompt', request.prompt);
      form.append('size', size);
      form.append('n', String(request.count));
      for (const ref of request.referenceImages) {
        form.append('image[]', new Blob([new Uint8Array(ref.buffer)], { type: ref.mimeType }), ref.filename);
      }
      response = await this.client.request<ImagesResponse>({ method: 'POST', url: '/images/edits', data: form });
    } else {
      response = await this.client.request<ImagesResponse>({
        method: 'POST',
        url: '/images/generations',
        data: { model: this.model, prompt: request.prompt, size, n: request.count },
      });
    }

    const images = response.data
      .filter((d) => d.b64_json)
      .map((d) => ({ buffer: Buffer.from(d.b64_json!, 'base64'), mimeType: 'image/png', revisedPrompt: d.revised_prompt }));
    if (images.length === 0) throw new ProviderError('The image provider returned no images', ErrorCode.AI_GENERATION_FAILED, true);
    return images;
  }
}
