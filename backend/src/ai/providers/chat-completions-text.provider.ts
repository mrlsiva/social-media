import { ProviderError } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AiSettingsService } from '../settings/ai-settings.service';
import { AiHttpClient } from './ai-http.client';
import { AiTextProvider, JsonCompletionRequest, JsonCompletionResult } from './ai-provider.interfaces';

interface ChatCompletionResponse {
  choices: { message: { content: string | null }; finish_reason: string }[];
  usage?: { total_tokens?: number };
}

/** Open models may wrap JSON in prose or ```json fences; keep only the outermost object. */
export function extractJsonObject(content: string): string {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  return start >= 0 && end > start ? content.slice(start, end + 1) : content;
}

/**
 * JSON-mode text generation over an OpenAI-style /chat/completions endpoint.
 * `lenientJson` adds an explicit instruction and tolerates wrapped output,
 * for open models that do not strictly honour response_format.
 */
export abstract class ChatCompletionsTextProvider implements AiTextProvider {
  protected constructor(
    protected readonly client: AiHttpClient,
    protected readonly settings: AiSettingsService,
    private readonly lenientJson: boolean,
  ) {}

  get name(): string {
    return this.client.providerId;
  }

  get model(): string {
    return this.settings.current().providers[this.client.providerId].textModel;
  }

  isConfigured(): boolean {
    return this.client.configured;
  }

  async completeJson<T>(request: JsonCompletionRequest): Promise<JsonCompletionResult<T>> {
    if (!this.model) throw new ProviderError(`${this.client.label} has no text model set`, ErrorCode.AI_PROVIDER_NOT_CONFIGURED);
    const system = this.lenientJson ? `${request.system}\n\nRespond with a single valid JSON object and nothing else.` : request.system;
    const response = await this.client.request<ChatCompletionResponse>({
      method: 'POST',
      url: '/chat/completions',
      data: {
        model: this.model,
        temperature: request.temperature ?? 0.8,
        max_tokens: request.maxTokens ?? 2500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: request.user },
        ],
      },
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError('The AI returned an empty response', ErrorCode.AI_GENERATION_FAILED, true);
    try {
      const json = this.lenientJson ? extractJsonObject(content) : content;
      return { data: JSON.parse(json) as T, tokensUsed: response.usage?.total_tokens ?? null };
    } catch {
      throw new ProviderError('The AI returned malformed JSON', ErrorCode.AI_GENERATION_FAILED, true);
    }
  }
}
