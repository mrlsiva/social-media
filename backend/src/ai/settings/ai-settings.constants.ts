export const AI_PROVIDER_IDS = ['openai', 'nvidia', 'custom'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiCapability = 'text' | 'image' | 'video';

/** Which providers can serve each kind of generation. */
export const AI_CAPABILITIES: Record<AiCapability, readonly AiProviderId[]> = {
  text: ['openai', 'nvidia', 'custom'],
  image: ['openai', 'nvidia', 'custom'],
  video: ['openai'],
};

export const AI_PROVIDER_META: Record<AiProviderId, { label: string; keyUrl: string | null; fixedBaseUrl: string | null }> = {
  openai: { label: 'OpenAI (ChatGPT)', keyUrl: 'https://platform.openai.com/api-keys', fixedBaseUrl: 'https://api.openai.com/v1' },
  nvidia: { label: 'NVIDIA', keyUrl: 'https://build.nvidia.com', fixedBaseUrl: 'https://integrate.api.nvidia.com/v1' },
  // Any OpenAI-compatible API: OpenRouter, Groq, DeepSeek, Together, Ollama, LM Studio...
  custom: { label: 'Custom (OpenAI-compatible)', keyUrl: null, fixedBaseUrl: null },
};

export const PROVIDER_FIELDS = ['apiKey', 'baseUrl', 'textModel', 'imageModel', 'videoModel'] as const;
export type ProviderField = (typeof PROVIDER_FIELDS)[number];

export interface AiProviderSettings {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
}

export interface AiSettingsSnapshot {
  textProvider: AiProviderId;
  imageProvider: AiProviderId;
  videoProvider: AiProviderId;
  providers: Record<AiProviderId, AiProviderSettings>;
}

export const settingKey = (provider: AiProviderId, field: ProviderField) => `ai.${provider}.${field}`;
export const SELECTION_KEYS: Record<AiCapability, string> = {
  text: 'ai.textProvider',
  image: 'ai.imageProvider',
  video: 'ai.videoProvider',
};
