import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Injects client IP + user agent (for sessions and audit logs). */
export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return {
    ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
});
