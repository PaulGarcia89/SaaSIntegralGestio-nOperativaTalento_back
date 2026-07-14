import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BRANCH_HEADER } from '../constants/auth.constants';
import { RoleScope } from '../enums/role-scope.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    const user = request.user;

    if (!tenantId || !user) {
      throw new AppException(
        'Tenant and user context are required',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    const branchHeader = request.headers[BRANCH_HEADER];
    const branchIdFromHeader = Array.isArray(branchHeader) ? branchHeader[0] : branchHeader;
    const candidateBranchId = branchIdFromHeader ?? user.activeBranchId;

    if (!candidateBranchId) {
      throw new AppException(
        'Branch context is required',
        ErrorCode.BRANCH_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!user.isSuperAdmin && user.roleScope !== RoleScope.TENANT_ADMIN) {
      if (!user.allowedBranchIds.includes(candidateBranchId)) {
        throw new AppException(
          'Requested branch is outside the allowed branch scope',
          ErrorCode.FORBIDDEN_BRANCH_SCOPE,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: candidateBranchId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        location: true,
      },
    });

    if (!branch) {
      throw new AppException(
        'Branch not found in the current tenant',
        ErrorCode.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    request.branch = branch;
    request.branchScope = {
      allowedBranchIds: user.allowedBranchIds,
      activeBranchId: branch.id,
    };

    return true;
  }
}
