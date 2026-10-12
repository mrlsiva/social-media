import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { AiHttpClient } from '../ai-http.client';

/** Thin OpenAI REST client (api.openai.com/v1). */
@Injectable()
export class OpenAiClient extends AiHttpClient {
  constructor(settings: AiSettingsService) {
    super(settings, 'openai', 'OpenAI');
  }
}
