import { AxiosError } from 'axios';
import { ProviderError } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { sleep } from '../common/utils/duration';

/** Converts a provider HTTP error into a ProviderError with retry/auth semantics. */
export function toProviderError(platform: string, err: unknown, extractMessage?: (data: unknown) => string | undefined): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const data = err.response?.data;
    const apiMessage = extractMessage?.(data) ?? genericMessage(data);
    const message = `${platform} API error${status ? ` (${status})` : ''}: ${apiMessage ?? err.message}`;
    if (status === 401) return new ProviderError(message, ErrorCode.TOKEN_EXPIRED, false, safeBody(data));
    const retryable = !status || status === 429 || status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
    return new ProviderError(message, ErrorCode.PLATFORM_API_ERROR, retryable, safeBody(data));
  }
  return new ProviderError(`${platform}: ${(err as Error)?.message ?? 'Unknown error'}`, ErrorCode.PLATFORM_API_ERROR, true);
}

function genericMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return typeof data === 'string' ? data.slice(0, 300) : undefined;
  const d = data as Record<string, unknown>;
  const error = d.error as Record<string, unknown> | string | undefined;
  if (typeof error === 'string') return (d.error_description as string) ?? error;
  return (error?.message as string) ?? (d.message as string) ?? undefined;
}

/** Keeps provider error bodies for logs but strips anything token-like. */
function safeBody(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  return JSON.parse(JSON.stringify(data, (key, value: unknown) => (/token|secret|authorization/i.test(key) ? '[REDACTED]' : value)));
}

/** Polls `check` until it returns a value or the timeout expires. */
export async function pollUntil<T>(check: () => Promise<T | null>, opts: { intervalMs: number; timeoutMs: number; timeoutMessage: string; platform: string }): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== null) return result;
    if (Date.now() > deadline) throw new ProviderError(`${opts.platform}: ${opts.timeoutMessage}`, ErrorCode.PUBLISH_FAILED, true);
    await sleep(opts.intervalMs);
  }
}

export const isLocalUrl = (url: string): boolean => {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return true;
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?)/.test(hostname)
    );
  } catch {
    return true;
  }
};
