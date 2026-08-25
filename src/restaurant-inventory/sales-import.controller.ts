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
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateExternalMappingDto } from './dto/restaurant-inventory.dto';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { SalesImportService } from './sales-import.service';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';

@Controller('restaurant-inventory/sales-imports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class SalesImportController {
  constructor(private readonly service: SalesImportService) {}
  @Get('template') @RequireAnyPermission('inventory.view', 'inventory.read') template(@Res() response: Response) { response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="ventas-importacion.csv"'); return response.send('external_sale_id,external_product_code,external_product_name,quantity,sold_at\nVENTA-001,HAMB-001,Hamburguesa,1,2026-08-23T12:00:00Z\n'); }
  @Post('upload') @AuditAction('SALES_IMPORT_UPLOADED') @RequirePermissions('inventory.create') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.SALES_IMPORT_MAX_BYTES ?? 25 * 1024 * 1024), files: 1 } })) upload(@Req() r: RequestWithUser, @UploadedFile() file: Express.Multer.File, @Query('branchId') branchId: string, @Query('warehouseId') warehouseId: string) { return this.service.upload(r.tenant!.id, r.user.sub, branchId, warehouseId, file); }
  @Get(':id') @RequireAnyPermission('inventory.view', 'inventory.read') summary(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.summary(r.tenant!.id, id); }
  @Get(':id/progress') @RequireAnyPermission('inventory.view', 'inventory.read') progress(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.progress(r.tenant!.id, id); }
  @Get(':id/errors') @RequireAnyPermission('inventory.view', 'inventory.read') errors(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.errors(r.tenant!.id, id); }
  @Post(':id/validate') @RequireAnyPermission('inventory.view', 'inventory.read') validate(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.validate(r.tenant!.id, id); }
  @Post(':id/process') @AuditAction('SALES_IMPORT_PROCESSED') @RequirePermissions('inventory.confirm') process(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.process(r.tenant!.id, r.user.sub, id); }
  @Post(':id/retry') @AuditAction('SALES_IMPORT_RETRIED') @RequirePermissions('inventory.update') retry(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.retry(r.tenant!.id, r.user.sub, id); }
  @Post(':id/cancel') @AuditAction('SALES_IMPORT_CANCELLED') @RequirePermissions('inventory.cancel') cancel(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancel(r.tenant!.id, r.user.sub, id); }
  @Post('mappings') @RequirePermissions('inventory.update') mapping(@Req() r: RequestWithUser, @Body() dto: CreateExternalMappingDto) { return this.service.mapProduct(r.tenant!.id, r.user.sub, dto); }
}
