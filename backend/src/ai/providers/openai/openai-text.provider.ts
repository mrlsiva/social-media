import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { ChatCompletionsTextProvider } from '../chat-completions-text.provider';
import { OpenAiClient } from './openai.client';

@Injectable()
export class OpenAiTextProvider extends ChatCompletionsTextProvider {
  constructor(client: OpenAiClient, settings: AiSettingsService) {
    super(client, settings, false);
  }
}
