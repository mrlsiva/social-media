import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { ErrorCode } from '../errors/error-codes';
import { AppException, ProviderError } from '../errors/app.exception';

interface ErrorEnvelope {
  success: false;
  message: string;
  error: { code: string; details?: unknown };
}

const STATUS_CODE_MAP: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.AUTH_INVALID,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.MEDIA_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/**
 * Centralised error handling. Every error leaves the API in the shape:
 * { success: false, message, error: { code, details? } }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toEnvelope(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          message: exception.message,
          error: { code: exception.code, details: exception.details },
        },
      };
    }

    if (exception instanceof ThrottlerException) {
      return this.build(HttpStatus.TOO_MANY_REQUESTS, 'Too many requests', ErrorCode.RATE_LIMITED);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message = exception.message;
      let details: unknown;
      if (typeof res === 'object' && res !== null) {
        const raw = (res as { message?: string | string[] }).message;
        if (Array.isArray(raw)) {
          message = 'Validation failed';
          details = raw;
        } else if (raw) {
          message = raw;
        }
      }
      const code = STATUS_CODE_MAP[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);
      return this.build(status, message, code, details);
    }

    if (exception instanceof ProviderError) {
      return this.build(HttpStatus.BAD_GATEWAY, exception.message, exception.code);
    }

    if (exception instanceof EntityNotFoundError) {
      return this.build(HttpStatus.NOT_FOUND, 'Resource not found', ErrorCode.NOT_FOUND);
    }

    if (exception instanceof QueryFailedError) {
      const driverCode = (exception as QueryFailedError & { code?: string }).code;
      if (driverCode === 'ER_DUP_ENTRY') {
        return this.build(HttpStatus.CONFLICT, 'Resource already exists', ErrorCode.CONFLICT);
      }
    }

    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error', ErrorCode.INTERNAL_ERROR);
  }

  private build(status: number, message: string, code: ErrorCode, details?: unknown) {
    return {
      status,
      body: { success: false as const, message, error: { code, ...(details ? { details } : {}) } },
    };
  }
}
