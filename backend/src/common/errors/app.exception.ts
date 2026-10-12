import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Domain exception carrying a stable error code. Thrown from services and
 * rendered by the global exception filter into the standard error envelope.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details } satisfies AppErrorBody, status);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static conflict(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }
}

/**
 * Error raised by social / AI provider adapters when the remote API rejects a call.
 * `retryable` lets the queue decide whether to retry automatically.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.PLATFORM_API_ERROR,
    public readonly retryable = false,
    public readonly providerResponse?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
