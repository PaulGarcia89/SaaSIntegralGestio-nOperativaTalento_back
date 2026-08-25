import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../constants/auth.constants';
import { AccessScope } from '../enums/access-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredPermissions || requiredPermissions.length === 0) && (!anyPermissions || anyPermissions.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role === 'SUPERADMIN' && request.user.isGlobalContext) {
      return true;
    }

    const ownedPermissions = new Set(request.user?.permissions ?? []);
    const hasPermission = (permission: string) => {
      if (ownedPermissions.has(permission)) return true;
      if (permission === 'inventory.read') return ownedPermissions.has('inventory.view');
      if (permission === 'inventory.view') return ownedPermissions.has('inventory.read');
      return false;
    };
    const hasAllPermissions = (requiredPermissions ?? []).every(hasPermission);
    const hasAnyPermission = !anyPermissions || anyPermissions.some((permission) => ownedPermissions.has(permission));

    if (!hasAllPermissions || !hasAnyPermission) {
      throw new AppException(
        'User does not have the required permissions',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
