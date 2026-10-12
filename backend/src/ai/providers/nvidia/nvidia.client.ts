import { Injectable } from '@nestjs/common';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { AiHttpClient } from '../ai-http.client';

/**
 * NVIDIA API (build.nvidia.com) client. LLMs are served from the
 * OpenAI-compatible integrate.api.nvidia.com; image models live under
 * ai.api.nvidia.com, so providers pass an absolute URL for those.
 */
@Injectable()
export class NvidiaClient extends AiHttpClient {
  constructor(settings: AiSettingsService) {
    super(settings, 'nvidia', 'NVIDIA');
  }
}
