import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { ProviderError } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AiProviderId } from '../settings/ai-settings.constants';
import { AiSettingsService } from '../settings/ai-settings.service';

/**
 * Bearer-token REST client for an AI provider. Credentials are read from
 * AiSettingsService on every request, so admin changes apply without a restart.
 * The API key never leaves the backend.
 */
export abstract class AiHttpClient {
  private readonly http: AxiosInstance = axios.create({ timeout: 180_000 });

  protected constructor(
    protected readonly settings: AiSettingsService,
    readonly providerId: AiProviderId,
    readonly label: string,
  ) {}

  get configured(): boolean {
    return this.settings.isConfigured(this.providerId);
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    if (!this.configured) {
      throw new ProviderError(`${this.label} is not configured. Add its API key in Admin > AI providers.`, ErrorCode.AI_PROVIDER_NOT_CONFIGURED);
    }
    const { apiKey, baseUrl } = this.settings.current().providers[this.providerId];
    try {
      const res = await this.http.request<T>({
        ...config,
        baseURL: baseUrl,
        headers: { Accept: 'application/json', ...(config.headers ?? {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      });
      return res.data;
    } catch (err) {
      throw this.toProviderError(err);
    }
  }

  private toProviderError(err: unknown): ProviderError {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const body = err.response?.data as { error?: { message?: string } | string; detail?: unknown; message?: string } | undefined;
      const detail = typeof body?.detail === 'string' ? body.detail : undefined;
      const apiMessage = typeof body?.error === 'string' ? body.error : (body?.error?.message ?? detail ?? body?.message);
      const message = `${this.label} request failed${status ? ` (${status})` : ''}: ${apiMessage ?? err.message}`;
      const retryable = !status || status === 429 || status >= 500;
      return new ProviderError(message, ErrorCode.AI_GENERATION_FAILED, retryable);
    }
    return new ProviderError(`${this.label} request failed: ${(err as Error).message}`, ErrorCode.AI_GENERATION_FAILED, true);
  }
}
