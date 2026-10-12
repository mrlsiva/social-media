import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY, RAW_RESPONSE_KEY } from '../decorators/response-message.decorator';
import { PaginatedResult } from '../dto/paginated-result';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
  meta: Record<string, unknown>;
}

/**
 * Wraps every successful response in the standard envelope:
 * { success: true, message, data, meta }.
 * Paginated results are unpacked so `meta` carries the pagination info.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<unknown> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<unknown> | T> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, targets)) {
      return next.handle();
    }
    const message = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, targets) ?? 'OK';

    return next.handle().pipe(
      map((payload) => {
        if (payload instanceof PaginatedResult) {
          return { success: true as const, message, data: payload.items, meta: { ...payload.meta } };
        }
        return { success: true as const, message, data: payload ?? null, meta: {} };
      }),
    );
  }
}
