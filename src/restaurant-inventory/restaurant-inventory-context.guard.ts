import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AccessScope } from '../common/enums/access-scope.enum';

@Injectable()
export class RestaurantInventoryContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.tenant?.id;
    if (!tenantId) throw new AppException('Tenant context is required', ErrorCode.TENANT_CONTEXT_REQUIRED, HttpStatus.FORBIDDEN);
    const source = { ...(request.query as Record<string, unknown>), ...(request.body as Record<string, unknown>) };
    const branchIds = [...new Set(['branchId', 'sourceBranchId', 'destinationBranchId'].map((key) => source[key]).filter((value): value is string => typeof value === 'string'))];
    const warehouseIds = [...new Set(['warehouseId', 'sourceWarehouseId', 'destinationWarehouseId'].map((key) => source[key]).filter((value): value is string => typeof value === 'string'))];
    for (const branchId of branchIds) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
      if (!branch) throw new AppException('Branch does not belong to the tenant', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      if (!this.hasBranchAccess(request, branchId)) throw new AppException('Branch is outside the user scope', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    for (const warehouseId of warehouseIds) {
      const matchingBranch = source.warehouseId === warehouseId && typeof source.branchId === 'string' ? source.branchId : undefined;
      const warehouse = await this.prisma.restaurantInventoryWarehouse.findFirst({ where: { id: warehouseId, tenantId, ...(matchingBranch ? { branchId: matchingBranch } : {}) }, select: { id: true, branchId: true } });
      if (!warehouse) throw new AppException('Warehouse does not belong to the tenant or branch', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      if (!this.hasBranchAccess(request, warehouse.branchId)) throw new AppException('Warehouse is outside the user scope', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
    for (const [warehouseKey, branchKey] of [['sourceWarehouseId', 'sourceBranchId'], ['destinationWarehouseId', 'destinationBranchId']] as const) {
      if (typeof source[warehouseKey] === 'string' && typeof source[branchKey] === 'string') {
        const warehouse = await this.prisma.restaurantInventoryWarehouse.findFirst({ where: { id: source[warehouseKey] as string, tenantId, branchId: source[branchKey] as string }, select: { id: true } });
        if (!warehouse) throw new AppException('Warehouse does not belong to the requested branch', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
        if (!this.hasBranchAccess(request, source[branchKey] as string)) throw new AppException('Branch is outside the user scope', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      }
    }
    request.branch = branchIds[0] ? { id: branchIds[0], tenantId, name: '', location: '' } : request.branch;
    return true;
  }

  private hasBranchAccess(request: RequestWithUser, branchId: string) {
    if (request.user?.isGlobalContext || request.user?.scope !== AccessScope.BRANCH) return true;
    return request.user.allowedBranchIds?.includes(branchId) ?? false;
  }
}
