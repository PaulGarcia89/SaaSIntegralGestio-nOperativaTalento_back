import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROUTE_SCOPE_KEY } from '../constants/auth.constants';
import { RoleScope } from '../enums/role-scope.enum';
import { RouteScope } from '../enums/route-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<RouteScope | undefined>(ROUTE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!scope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (user?.isSuperAdmin) {
      return true;
    }

    if (!user) {
      throw new AppException(
        'Missing authenticated user scope',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (scope === RouteScope.BRANCH_LOCAL) {
      if (
        user.roleScope === RoleScope.TENANT_ADMIN ||
        user.roleScope === RoleScope.BRANCH_ADMIN ||
        user.roleScope === RoleScope.BRANCH_USER
      ) {
        return true;
      }

      throw new AppException(
        'User does not have branch-local access',
        ErrorCode.FORBIDDEN_BRANCH_SCOPE,
        HttpStatus.FORBIDDEN,
      );
    }

    if (scope === RouteScope.TENANT_WIDE) {
      if (request.method === 'GET') {
        if (
          user.roleScope === RoleScope.TENANT_ADMIN ||
          user.roleScope === RoleScope.BRANCH_ADMIN
        ) {
          return true;
        }
      } else if (user.roleScope === RoleScope.TENANT_ADMIN) {
        return true;
      }

      throw new AppException(
        'User does not have tenant-wide access',
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
