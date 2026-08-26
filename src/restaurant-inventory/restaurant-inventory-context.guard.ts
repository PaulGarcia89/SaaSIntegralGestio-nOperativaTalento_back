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
    const requestedBranchIds = Array.isArray(source.branchIds) ? source.branchIds : typeof source.branchIds === 'string' ? source.branchIds.split(',').map((value) => value.trim()) : [];
    const branchIds = [...new Set([...['branchId', 'sourceBranchId', 'destinationBranchId'].map((key) => source[key]).filter((value): value is string => typeof value === 'string'), ...requestedBranchIds.filter((value): value is string => typeof value === 'string')])];
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
    await this.validateDocumentContext(request, tenantId);
    const contextBranchId = branchIds[0] ?? request.user?.activeBranchId ?? null;
    request.restaurantInventoryContext = { companyId: tenantId, branchId: contextBranchId, warehouseId: warehouseIds[0] ?? null };
    request.branch = contextBranchId ? { id: contextBranchId, tenantId, name: '', location: '' } : request.branch;
    return true;
  }

  private async validateDocumentContext(request: RequestWithUser, tenantId: string) {
    const id = request.params?.id;
    if (typeof id !== 'string') return;
    const path = request.route?.path ?? request.path;
    const resources: Array<{ marker: string; model: keyof PrismaService; fields: string[] }> = [
      { marker: 'receipts', model: 'restaurantGoodsReceipt', fields: ['branchId', 'warehouseId'] },
      { marker: 'consumptions', model: 'restaurantConsumptionRecord', fields: ['branchId', 'warehouseId'] },
      { marker: 'wastes', model: 'restaurantWasteRecord', fields: ['branchId', 'warehouseId'] },
      { marker: 'productions', model: 'restaurantProductionOrder', fields: ['branchId', 'warehouseId'] },
      { marker: 'stock-counts', model: 'restaurantStockCount', fields: ['branchId', 'warehouseId'] },
      { marker: 'transfers', model: 'restaurantStockTransfer', fields: ['sourceBranchId', 'sourceWarehouseId', 'destinationBranchId', 'destinationWarehouseId'] },
      { marker: 'sales-imports', model: 'restaurantSalesImport', fields: ['branchId', 'warehouseId'] },
      { marker: 'purchase-orders', model: 'restaurantPurchaseOrder', fields: ['branchId', 'warehouseId'] },
      { marker: 'invoices', model: 'restaurantInvoice', fields: ['branchId', 'warehouseId'] },
      { marker: 'stock-count-schedules', model: 'restaurantStockCountSchedule', fields: ['branchId', 'warehouseId'] },
    ];
    const resource = resources.find((candidate) => path.includes(candidate.marker));
    if (!resource) return;
    const delegate: any = (this.prisma as any)[resource.model];
    if (!delegate?.findFirst) return;
    const document = await delegate.findFirst({ where: { id, tenantId }, select: Object.fromEntries(resource.fields.map((field) => [field, true])) });
    if (!document) throw new AppException('Inventory document was not found in the tenant', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    for (const branchKey of resource.fields.filter((field) => field.toLowerCase().includes('branch'))) {
      const branchId = document[branchKey];
      if (branchId && !this.hasBranchAccess(request, branchId)) throw new AppException('Document branch is outside the user scope', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      if (branchId) {
        const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
        if (!branch) throw new AppException('Document branch does not belong to the tenant', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      }
    }
    for (const warehouseKey of resource.fields.filter((field) => field.toLowerCase().includes('warehouse'))) {
      const warehouseId = document[warehouseKey];
      if (!warehouseId) continue;
      const branchKey = warehouseKey === 'warehouseId' ? 'branchId' : warehouseKey.replace('Warehouse', 'Branch');
      const warehouse = await this.prisma.restaurantInventoryWarehouse.findFirst({ where: { id: warehouseId, tenantId, ...(document[branchKey] ? { branchId: document[branchKey] } : {}) }, select: { id: true, branchId: true } });
      if (!warehouse) throw new AppException('Document warehouse does not belong to its branch', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      if (document[branchKey] && warehouse.branchId !== document[branchKey]) throw new AppException('Document warehouse does not belong to its branch', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
      if (!this.hasBranchAccess(request, warehouse.branchId)) throw new AppException('Document warehouse is outside the user scope', ErrorCode.BRANCH_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }
  }

  private hasBranchAccess(request: RequestWithUser, branchId: string) {
    if (request.user?.isGlobalContext || request.user?.scope !== AccessScope.BRANCH) return true;
    return request.user.allowedBranchIds?.includes(branchId) ?? false;
  }
}
