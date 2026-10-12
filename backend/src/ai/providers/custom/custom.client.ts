import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { AiHttpClient } from '../ai-http.client';

/** Any OpenAI-compatible API (OpenRouter, Groq, DeepSeek, Together, Ollama, LM Studio...) at an admin-set base URL. */
@Injectable()
export class CustomAiClient extends AiHttpClient {
  constructor(settings: AiSettingsService) {
    super(settings, 'custom', 'Custom AI provider');
  }
}
