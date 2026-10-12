/**
 * Provider contracts. Services depend only on these interfaces; the concrete
 * provider is chosen by AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER / AI_VIDEO_PROVIDER.
 * To add a provider: implement the interface and register it in ai.module.ts.
 */

export const AI_TEXT_PROVIDER = Symbol('AI_TEXT_PROVIDER');
export const AI_IMAGE_PROVIDER = Symbol('AI_IMAGE_PROVIDER');
export const AI_VIDEO_PROVIDER = Symbol('AI_VIDEO_PROVIDER');

export interface AiProviderInfo {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
}

export interface JsonCompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface JsonCompletionResult<T> {
  data: T;
  tokensUsed: number | null;
}

export interface AiTextProvider extends AiProviderInfo {
  /** Returns a parsed JSON object produced by the model. */
  completeJson<T>(request: JsonCompletionRequest): Promise<JsonCompletionResult<T>>;
}

export type ImageAspect = 'square' | 'portrait' | 'landscape';

export interface ImageGenerationRequest {
  prompt: string;
  aspect: ImageAspect;
  count: number;
  /** Optional reference images (e.g. brand logo) the model should incorporate. */
  referenceImages?: { buffer: Buffer; mimeType: string; filename: string }[];
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  revisedPrompt?: string;
}

export interface AiImageProvider extends AiProviderInfo {
  generate(request: ImageGenerationRequest): Promise<GeneratedImage[]>;
}

export type VideoAspect = 'portrait' | 'landscape';

export interface VideoGenerationRequest {
  prompt: string;
  seconds: number;
  aspect: VideoAspect;
}

export interface VideoJobStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number | null;
  error?: string;
}

export interface AiVideoProvider extends AiProviderInfo {
  /** Durations (seconds) the provider can render; requests are snapped to the nearest. */
  readonly supportedDurations: number[];
  start(request: VideoGenerationRequest): Promise<{ externalJobId: string }>;
  getStatus(externalJobId: string): Promise<VideoJobStatus>;
  download(externalJobId: string): Promise<{ buffer: Buffer; mimeType: string }>;
}
