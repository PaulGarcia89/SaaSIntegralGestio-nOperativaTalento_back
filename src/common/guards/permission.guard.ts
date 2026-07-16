import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../constants/auth.constants';
import { AccessScope } from '../enums/access-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.scope === AccessScope.GLOBAL) {
      return true;
    }

    const ownedPermissions = new Set(request.user?.permissions ?? []);
    const hasAllPermissions = requiredPermissions.every((permission) => ownedPermissions.has(permission));

    if (!hasAllPermissions) {
      throw new ForbiddenException('User does not have the required permissions');
    }

    return true;
  }
}
