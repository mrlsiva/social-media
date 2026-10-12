import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUser, PERMISSIONS_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** System-level RBAC (roles / permissions tables). Brand-level access is checked by BrandAccessService. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
    if (roles.length === 0 && permissions.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) return false;

    const hasRole = roles.length === 0 || roles.some((r) => user.roles.includes(r));
    const hasPermissions = permissions.every((p) => user.permissions.includes(p));
    if (!hasRole || !hasPermissions) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, 'You do not have permission to perform this action');
    }
    return true;
  }
}
