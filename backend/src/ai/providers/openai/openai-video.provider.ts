import { Injectable } from '@nestjs/common';
import { AiVideoProvider, VideoGenerationRequest, VideoJobStatus } from '../ai-provider.interfaces';
import { AiSettingsService } from '../../settings/ai-settings.service';
import { OpenAiClient } from './openai.client';

interface VideoObject {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: { message?: string } | null;
}

/**
 * OpenAI Sora video generation (asynchronous):
 *   POST /v1/videos -> GET /v1/videos/{id} (poll) -> GET /v1/videos/{id}/content
 * Sora renders synchronized audio, so voice-over and music are described in the prompt.
 */
@Injectable()
export class OpenAiVideoProvider implements AiVideoProvider {
  readonly name = 'openai';
  readonly supportedDurations = [4, 8, 12];

  constructor(
    private readonly client: OpenAiClient,
    private readonly settings: AiSettingsService,
  ) {}

  get model(): string {
    return this.settings.current().providers.openai.videoModel;
  }

  isConfigured(): boolean {
    return this.client.configured;
  }

  async start(request: VideoGenerationRequest): Promise<{ externalJobId: string }> {
    const form = new FormData();
    form.append('model', this.model);
    form.append('prompt', request.prompt);
    form.append('seconds', String(request.seconds));
    form.append('size', request.aspect === 'portrait' ? '720x1280' : '1280x720');
    const video = await this.client.request<VideoObject>({ method: 'POST', url: '/videos', data: form });
    return { externalJobId: video.id };
  }

  async getStatus(externalJobId: string): Promise<VideoJobStatus> {
    const video = await this.client.request<VideoObject>({ method: 'GET', url: `/videos/${encodeURIComponent(externalJobId)}` });
    const map: Record<VideoObject['status'], VideoJobStatus['status']> = {
      queued: 'queued',
      in_progress: 'processing',
      completed: 'completed',
      failed: 'failed',
    };
    return {
      status: map[video.status] ?? 'processing',
      progress: typeof video.progress === 'number' ? Math.round(video.progress) : null,
      error: video.error?.message,
    };
  }

  async download(externalJobId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const data = await this.client.request<ArrayBuffer>({
      method: 'GET',
      url: `/videos/${encodeURIComponent(externalJobId)}/content`,
      responseType: 'arraybuffer',
    });
    return { buffer: Buffer.from(data), mimeType: 'video/mp4' };
  }
}
