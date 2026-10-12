import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { ChatCompletionsTextProvider } from '../chat-completions-text.provider';
import { CustomAiClient } from './custom.client';

@Injectable()
export class CustomTextProvider extends ChatCompletionsTextProvider {
  constructor(client: CustomAiClient, settings: AiSettingsService) {
    super(client, settings, true);
  }
}
