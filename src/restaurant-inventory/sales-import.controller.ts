import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { InventoryCapabilityCode } from '@prisma/client';
import { RequireInventoryCapability } from '../inventory-capabilities/inventory-capability.decorator';
import { InventoryCapabilityGuard } from '../inventory-capabilities/inventory-capability.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditAction } from '../audit/audit-action.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ConfigureSalesImportDto, CreateExternalMappingDto } from './dto/restaurant-inventory.dto';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { SalesImportService } from './sales-import.service';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';
import { RestaurantInventoryResponseInterceptor } from './restaurant-inventory-response.interceptor';
import { RestaurantInventoryIdempotencyInterceptor } from './restaurant-inventory-idempotency.interceptor';

@Controller('restaurant-inventory/sales-imports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@UseInterceptors(RestaurantInventoryResponseInterceptor, RestaurantInventoryIdempotencyInterceptor)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class SalesImportController {
  constructor(private readonly service: SalesImportService) {}
  @Get('template') @RequirePermissions('inventory.read') template(@Res() response: Response) { response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="ventas-importacion.csv"'); return response.send('external_sale_id,external_product_code,external_product_name,quantity,sold_at\nVENTA-001,HAMB-001,Hamburguesa,1,2026-08-23T12:00:00Z\n'); }
  @Get('history') @RequirePermissions('inventory.read') history(@Req() r: RequestWithUser, @Query('branchId') branchId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.service.history(r.tenant!.id, { branchId, page: Number(page) || 1, pageSize: Number(pageSize) || 25 }); }
  @Get('mappings') @RequirePermissions('inventory.read') mappings(@Req() r: RequestWithUser, @Query('branchId') branchId?: string) { return this.service.mappings(r.tenant!.id, undefined, branchId); }
  @Post('upload') @AuditAction('SALES_IMPORT_UPLOADED') @RequirePermissions('restaurant_inventory.operations.create') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.SALES_IMPORT_MAX_BYTES ?? 25 * 1024 * 1024), files: 1 } })) upload(@Req() r: RequestWithUser, @UploadedFile() file: Express.Multer.File, @Query('branchId') branchId: string, @Query('warehouseId') warehouseId: string) { return this.service.upload(r.tenant!.id, r.user.sub, branchId, warehouseId, file); }
  @Get(':id') @RequirePermissions('inventory.read') summary(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.summary(r.tenant!.id, id); }
  @Get(':id/mappings') @RequirePermissions('inventory.read') sessionMappings(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.mappings(r.tenant!.id, id); }
  @Post(':id/columns') @RequirePermissions('inventory.read') columns(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.columns(r.tenant!.id, id); }
  @Post(':id/configure') @RequirePermissions('restaurant_inventory.operations.create') configure(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: ConfigureSalesImportDto) { return this.service.configure(r.tenant!.id, r.user.sub, id, dto); }
  @Get(':id/progress') @RequirePermissions('inventory.read') progress(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.progress(r.tenant!.id, id); }
  @Get(':id/errors') @RequirePermissions('inventory.read') errors(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.errors(r.tenant!.id, id); }
  @Get(':id/errors/export') @RequirePermissions('inventory.read') errorsExport(@Req() r: RequestWithUser, @Param('id') id: string, @Res() response: Response) { return this.service.errorsCsv(r.tenant!.id, id).then((csv) => { response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="sales-import-${id}-errors.csv"`); return response.send(csv); }); }
  @Post(':id/validate') @RequirePermissions('inventory.read') validate(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.validate(r.tenant!.id, id); }
  @Post(':id/preview') @RequirePermissions('inventory.read') preview(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.preview(r.tenant!.id, id); }
  @Post(':id/process') @AuditAction('SALES_IMPORT_PROCESSED') @RequirePermissions('restaurant_inventory.operations.confirm') process(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.process(r.tenant!.id, r.user.sub, id); }
  @Post(':id/retry') @AuditAction('SALES_IMPORT_RETRIED') @RequirePermissions('inventory.update') retry(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.retry(r.tenant!.id, r.user.sub, id); }
  @Post(':id/cancel') @AuditAction('SALES_IMPORT_CANCELLED') @RequirePermissions('inventory.cancel') cancel(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancel(r.tenant!.id, r.user.sub, id); }
  @Post('mappings') @RequirePermissions('inventory.update') mapping(@Req() r: RequestWithUser, @Body() dto: CreateExternalMappingDto) { return this.service.mapProduct(r.tenant!.id, r.user.sub, dto); }
}
