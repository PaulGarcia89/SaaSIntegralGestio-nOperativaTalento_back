import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ROUTE_SCOPE_KEY, TENANT_HEADER } from '../constants/auth.constants';
import { RouteScope } from '../enums/route-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';
import { AccessControlService } from '../../access-control/access-control.service';
import { AccessScope } from '../enums/access-scope.enum';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const routeScope = this.reflector.getAllAndOverride<RouteScope | undefined>(ROUTE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!user) {
      throw new AppException(
        'Missing authenticated user context',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (routeScope === RouteScope.GLOBAL_ONLY) {
      request.accessContext = {
        actorScope: user.scope,
        isGlobalRoute: true,
        resolvedTenantId: null,
      };
      return true;
    }

    const tenantHeader = request.headers[TENANT_HEADER];
    const requestedTenantId = (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) ?? null;
    const tenantId = this.accessControl.resolveTenantId(user, requestedTenantId);
    if (!tenantId) {
      throw new AppException(
        'Tenant context is required',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    this.accessControl.assertTenantAccess(user, tenantId, 'User does not belong to the requested tenant');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true, status: true },
    });

    if (!tenant) {
      throw new AppException('Tenant not found', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    if (tenant.status !== 'ACTIVE' && !user.isSuperAdmin) {
      throw new AppException('Tenant is not active', ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN);
    }

    request.tenant = tenant;
    request.accessContext = {
      actorScope: user.scope ?? AccessScope.TENANT,
      isGlobalRoute: false,
      resolvedTenantId: tenant.id,
    };
    return true;
  }
}
