import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { ChatCompletionsTextProvider } from '../chat-completions-text.provider';
import { NvidiaClient } from './nvidia.client';

@Injectable()
export class NvidiaTextProvider extends ChatCompletionsTextProvider {
  constructor(client: NvidiaClient, settings: AiSettingsService) {
    super(client, settings, true);
  }
}
