import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from '../types/request-with-user.type';
import { TENANT_HEADER } from '../constants/auth.constants';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new AppException(
        'Missing authenticated user context',
        ErrorCode.UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tenantHeader = request.headers[TENANT_HEADER];
    const tenantId = (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) ?? user.tenantId;
    if (!tenantId) {
      throw new AppException(
        'Tenant context is required',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!user.isSuperAdmin && user.tenantId !== tenantId) {
      throw new AppException(
        'User does not belong to the requested tenant',
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
      );
    }

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
    return true;
  }
}
