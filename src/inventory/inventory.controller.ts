import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ModuleCode } from '@prisma/client';
import type { Response } from 'express';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { AdjustInventoryStockDto, AssignInventoryAssetDto, CountInventoryStockDto, CreateInventoryAssetDto, CreateInventoryItemDto, CreateInventoryLocationDto, CreateInventoryMaintenanceDto, CreateInventorySupplierDto, CreatePurchaseOrderDto, InventoryOperationDto, ListInventoryAssetsDto, ListInventoryWarehouseDto, ReceivePurchaseOrderDto, ResolveInventoryMaintenanceDto, TransferInventoryAssetDto, UpdateInventoryStockPolicyDto, ValidateInventoryReturnDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import { InventoryCapabilityGuard } from '../inventory-capabilities/inventory-capability.guard';
import { RequireInventoryCapability } from '../inventory-capabilities/inventory-capability.decorator';
import { InventoryCapabilityCode } from '@prisma/client';

const fileOptions = {
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_request: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) =>
    callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, ScopeGuard, PermissionGuard, InventoryCapabilityGuard)
@RequireModule(ModuleCode.INVENTORY)
@RequireInventoryCapability(InventoryCapabilityCode.ASSET_INVENTORY)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('context') @RequirePermissions('inventory.read')
  context(@Req() request: RequestWithUser) { return this.service.context(request.tenant!.id); }

  @Get('catalog') @RequirePermissions('inventory.read')
  catalog(@Req() request: RequestWithUser) { return this.service.listItems(request.tenant!.id); }

  @Get('analytics') @RequirePermissions('inventory.read')
  analytics(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) { return this.service.analytics(request.tenant!.id, branchId); }

  @Get('audit-trail') @RequirePermissions('inventory.manage')
  auditTrail(@Req() request: RequestWithUser, @Query('branchId') branchId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.service.auditTrail(request.tenant!.id, branchId, Number(page) || 1, Math.min(Number(pageSize) || 25, 100)); }

  @Get('locations') @RequirePermissions('inventory.read')
  locations(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) { return this.service.listLocations(request.tenant!.id, branchId); }

  @Post('locations') @RequirePermissions('inventory.manage')
  createLocation(@Req() request: RequestWithUser, @Body() dto: CreateInventoryLocationDto) { request.auditAction = 'INVENTORY_LOCATION_CREATED'; return this.service.createLocation(request.tenant!.id, dto); }

  @Get('warehouse') @RequirePermissions('inventory.read')
  warehouse(@Req() request: RequestWithUser, @Query() query: ListInventoryWarehouseDto) { return this.service.warehouse(request.tenant!.id, query); }

  @Post('warehouse/adjustments') @RequirePermissions('inventory.manage')
  adjust(@Req() request: RequestWithUser, @Body() dto: AdjustInventoryStockDto) { request.auditAction = 'INVENTORY_STOCK_ADJUSTED'; return this.service.adjustStock(request.tenant!.id, request.user.sub, dto); }

  @Post('warehouse/counts') @RequirePermissions('inventory.manage')
  count(@Req() request: RequestWithUser, @Body() dto: CountInventoryStockDto) { request.auditAction = 'INVENTORY_STOCK_COUNTED'; return this.service.countStock(request.tenant!.id, request.user.sub, dto); }

  @Patch('warehouse/policy') @RequirePermissions('inventory.manage')
  updateStockPolicy(@Req() request: RequestWithUser, @Body() dto: UpdateInventoryStockPolicyDto) { request.auditAction = 'INVENTORY_STOCK_POLICY_UPDATED'; return this.service.updateStockPolicy(request.tenant!.id, dto); }

  @Get('suppliers') @RequirePermissions('inventory.read') suppliers(@Req() request: RequestWithUser) { return this.service.listSuppliers(request.tenant!.id); }
  @Post('suppliers') @RequirePermissions('inventory.manage') supplier(@Req() request: RequestWithUser, @Body() dto: CreateInventorySupplierDto) { request.auditAction = 'INVENTORY_SUPPLIER_CREATED'; return this.service.createSupplier(request.tenant!.id, dto); }
  @Get('purchase-orders') @RequirePermissions('inventory.read') purchaseOrders(@Req() request: RequestWithUser, @Query('branchId') branchId?: string) { return this.service.listPurchaseOrders(request.tenant!.id, branchId); }
  @Post('purchase-orders') @RequirePermissions('inventory.manage') purchaseOrder(@Req() request: RequestWithUser, @Body() dto: CreatePurchaseOrderDto) { request.auditAction = 'INVENTORY_PURCHASE_ORDER_CREATED'; return this.service.createPurchaseOrder(request.tenant!.id, request.user.sub, dto); }
  @Post('purchase-orders/:id/approve') @RequirePermissions('inventory.manage') approvePurchaseOrder(@Req() request: RequestWithUser, @Param('id') id: string) { request.auditAction = 'INVENTORY_PURCHASE_ORDER_APPROVED'; return this.service.approvePurchaseOrder(request.tenant!.id, id, request.user.sub); }
  @Post('purchase-orders/:id/receive') @RequirePermissions('inventory.manage') receivePurchaseOrder(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) { request.auditAction = 'INVENTORY_PURCHASE_ORDER_RECEIVED'; return this.service.receivePurchaseOrder(request.tenant!.id, id, request.user.sub, dto); }
  @Get('maintenance') @RequirePermissions('inventory.read') maintenance(@Req() request: RequestWithUser) { return this.service.listMaintenance(request.tenant!.id); }
  @Post('maintenance') @RequirePermissions('inventory.manage') createMaintenance(@Req() request: RequestWithUser, @Body() dto: CreateInventoryMaintenanceDto) { request.auditAction = 'INVENTORY_MAINTENANCE_CREATED'; return this.service.createMaintenance(request.tenant!.id, request.user.sub, dto); }
  @Post('maintenance/:id/resolve') @RequirePermissions('inventory.manage') resolveMaintenance(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: ResolveInventoryMaintenanceDto) { request.auditAction = 'INVENTORY_MAINTENANCE_RESOLVED'; return this.service.resolveMaintenance(request.tenant!.id, id, request.user.sub, dto); }

  @Get('warehouse/movements/export') @RequirePermissions('inventory.read')
  async exportMovements(@Req() request: RequestWithUser, @Query('branchId') branchId: string | undefined, @Res() response: Response) { const rows = await this.service.exportMovements(request.tenant!.id, branchId); const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`; const csv = ["fecha,tipo,itemId,sucursalId,cantidad,saldo,motivo,actor", ...rows.map((row) => [row.occurredAt.toISOString(), row.type, row.itemId, row.branchId, row.quantity, row.balanceAfter, row.reason, row.actorUserId].map(escape).join(','))].join('\n'); response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="movimientos-inventario.csv"'); response.send(csv); }

  @Post('catalog') @RequirePermissions('inventory.manage')
  createCatalog(@Req() request: RequestWithUser, @Body() dto: CreateInventoryItemDto) {
    request.auditAction = 'INVENTORY_CATALOG_ITEM_CREATED';
    return this.service.createItem(request.tenant!.id, dto);
  }

  @Get('assets') @RequirePermissions('inventory.read')
  assets(@Req() request: RequestWithUser, @Query() query: ListInventoryAssetsDto) { return this.service.listAssets(request.tenant!.id, query); }

  @Get('my-assets') @RequirePermissions('inventory.read')
  myAssets(@Req() request: RequestWithUser) { return this.service.listMyAssets(request.tenant!.id, request.user.sub); }

  @Get('assets/lookup/:assetTag') @RequirePermissions('inventory.read')
  lookupAsset(@Req() request: RequestWithUser, @Param('assetTag') assetTag: string) { return this.service.findAssetByTag(request.tenant!.id, assetTag); }

  @Get('assets/:id') @RequirePermissions('inventory.read')
  asset(@Req() request: RequestWithUser, @Param('id') id: string) { return this.service.getAsset(request.tenant!.id, id); }

  @Post('assets') @RequirePermissions('inventory.manage')
  createAsset(@Req() request: RequestWithUser, @Body() dto: CreateInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_REGISTERED';
    return this.service.createAsset(request.tenant!.id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/assign') @RequirePermissions('inventory.manage')
  assign(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: AssignInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_ASSIGNED';
    return this.service.assign(request.tenant!.id, id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/deliver') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  deliver(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_ASSET_DELIVERED';
    return this.service.deliver(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Post('assets/:id/transfer') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  transfer(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: TransferInventoryAssetDto) {
    request.auditAction = 'INVENTORY_ASSET_TRANSFERRED';
    return this.service.transfer(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Post('assets/:id/request-return') @RequirePermissions('inventory.manage')
  requestReturn(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_RETURN_REQUESTED';
    return this.service.requestReturn(request.tenant!.id, id, request.user.sub, dto, request.requestId);
  }

  @Post('assets/:id/return') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  returnAsset(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: InventoryOperationDto) {
    request.auditAction = 'INVENTORY_ASSET_RETURNED';
    return this.service.returnAsset(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Patch('assets/:id/validate-return') @RequirePermissions('inventory.manage') @UseInterceptors(FileInterceptor('evidence', fileOptions))
  validate(@Req() request: RequestWithUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: ValidateInventoryReturnDto) {
    request.auditAction = 'INVENTORY_RETURN_VALIDATED';
    return this.service.validateReturn(request.tenant!.id, id, request.user.sub, dto, file, request.requestId);
  }

  @Get('evidence/:id') @RequirePermissions('inventory.read')
  async evidence(@Req() request: RequestWithUser, @Param('id') id: string, @Res() response: Response) {
    const result = await this.service.evidence(request.tenant!.id, id);
    if (!result.buffer.length) throw new BadRequestException('Empty evidence');
    response.setHeader('Content-Type', result.evidence.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.evidence.originalName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(result.buffer);
  }
}
