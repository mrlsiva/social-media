import { Injectable } from '@nestjs/common';
import { AiProviderId } from '../settings/ai-settings.constants';
import { AiSettingsService } from '../settings/ai-settings.service';
import { AiImageProvider, AiTextProvider, ImageGenerationRequest, JsonCompletionRequest } from './ai-provider.interfaces';
import { CustomImageProvider } from './custom/custom-image.provider';
import { CustomTextProvider } from './custom/custom-text.provider';
import { NvidiaImageProvider } from './nvidia/nvidia-image.provider';
import { NvidiaTextProvider } from './nvidia/nvidia-text.provider';
import { OpenAiImageProvider } from './openai/openai-image.provider';
import { OpenAiTextProvider } from './openai/openai-text.provider';

/** Delegates each call to the text provider currently selected in Admin > AI providers. */
@Injectable()
export class RoutingTextProvider implements AiTextProvider {
  private readonly registry: Record<AiProviderId, AiTextProvider>;

  constructor(
    private readonly settings: AiSettingsService,
    openai: OpenAiTextProvider,
    nvidia: NvidiaTextProvider,
    custom: CustomTextProvider,
  ) {
    this.registry = { openai, nvidia, custom };
  }

  /** A specific provider regardless of the selection (used by the admin connection test). */
  get(id: AiProviderId): AiTextProvider {
    return this.registry[id];
  }

  private get active(): AiTextProvider {
    return this.registry[this.settings.current().textProvider];
  }

  get name(): string {
    return this.active.name;
  }

  get model(): string {
    return this.active.model;
  }

  isConfigured(): boolean {
    return this.active.isConfigured();
  }

  completeJson<T>(request: JsonCompletionRequest) {
    return this.active.completeJson<T>(request);
  }
}

/** Delegates each call to the image provider currently selected in Admin > AI providers. */
@Injectable()
export class RoutingImageProvider implements AiImageProvider {
  private readonly registry: Record<AiProviderId, AiImageProvider>;

  constructor(
    private readonly settings: AiSettingsService,
    openai: OpenAiImageProvider,
    nvidia: NvidiaImageProvider,
    custom: CustomImageProvider,
  ) {
    this.registry = { openai, nvidia, custom };
  }

  private get active(): AiImageProvider {
    return this.registry[this.settings.current().imageProvider];
  }

  get name(): string {
    return this.active.name;
  }

  get model(): string {
    return this.active.model;
  }

  isConfigured(): boolean {
    return this.active.isConfigured();
  }

  generate(request: ImageGenerationRequest) {
    return this.active.generate(request);
  }
}
