import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Marks a route as not requiring a bearer token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires one of the given system roles (e.g. `admin`). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Requires all of the given system permissions (e.g. `plans.manage`). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated user resolved by the JWT strategy. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
