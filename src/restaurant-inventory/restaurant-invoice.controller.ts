import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryCapabilityCode } from '@prisma/client';
import { RequireInventoryCapability } from '../inventory-capabilities/inventory-capability.decorator';
import { InventoryCapabilityGuard } from '../inventory-capabilities/inventory-capability.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';
import { RestaurantInvoiceService } from './restaurant-invoice.service';
import { AuditAction } from '../audit/audit-action.decorator';
import { UseInterceptors as UseResponseInterceptors } from '@nestjs/common';
import { RestaurantInventoryResponseInterceptor } from './restaurant-inventory-response.interceptor';
import { RestaurantInventoryIdempotencyInterceptor } from './restaurant-inventory-idempotency.interceptor';

@Controller('restaurant-inventory/invoices')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
@UseResponseInterceptors(RestaurantInventoryResponseInterceptor, RestaurantInventoryIdempotencyInterceptor)
export class RestaurantInvoiceController {
  constructor(private readonly service: RestaurantInvoiceService) {}
  @Post('upload') @RequirePermissions('restaurant_inventory.invoices.upload') @AuditAction('RESTAURANT_INVOICE_UPLOADED') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.INVOICE_MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024), files: 1 } })) upload(@Req() r: RequestWithUser, @UploadedFile() file: Express.Multer.File, @Query('branchId') branchId: string, @Query('warehouseId') warehouseId: string) { return this.service.upload(r.tenant!.id, r.user.sub, branchId, warehouseId, file); }
  @Get() @RequirePermissions('inventory.read') list(@Req() r: RequestWithUser, @Query() query: any) { return this.service.list(r.tenant!.id, query); }
  @Get(':id') @RequirePermissions('inventory.read') get(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.get(r.tenant!.id, id); }
  @Post(':id/process') @RequirePermissions('restaurant_inventory.invoices.process') @AuditAction('RESTAURANT_INVOICE_PROCESSED') process(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.process(r.tenant!.id, r.user.sub, id); }
  @Post(':id/match') @RequirePermissions('restaurant_inventory.invoices.reconcile') @AuditAction('RESTAURANT_INVOICE_MATCHED') match(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: any) { return this.service.match(r.tenant!.id, r.user.sub, id, dto); }
  @Post(':id/approve') @RequirePermissions('restaurant_inventory.invoices.approve') @AuditAction('RESTAURANT_INVOICE_APPROVED') approve(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.approve(r.tenant!.id, r.user.sub, id); }
  @Post(':id/reject') @RequirePermissions('restaurant_inventory.invoices.approve') @AuditAction('RESTAURANT_INVOICE_REJECTED') reject(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: { reason: string }) { return this.service.reject(r.tenant!.id, r.user.sub, id, dto.reason); }
}
