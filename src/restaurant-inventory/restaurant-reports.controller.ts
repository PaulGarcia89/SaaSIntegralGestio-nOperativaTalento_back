import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { InventoryCapabilityCode } from '@prisma/client';
import { RequireInventoryCapability } from '../inventory-capabilities/inventory-capability.decorator';
import { InventoryCapabilityGuard } from '../inventory-capabilities/inventory-capability.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditAction } from '../audit/audit-action.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { RestaurantReportsService } from './restaurant-reports.service';

@Controller('restaurant-inventory/reports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class RestaurantReportsController {
  constructor(private readonly reports: RestaurantReportsService) {}
  @Get(':type') @RequirePermissions('inventory.read') report(@Req() r: RequestWithUser, @Param('type') type: string, @Query() query: any) { return this.reports.report(r.tenant!.id, type, query); }
  @Get(':type/export') @RequirePermissions('inventory.report.export') @AuditAction('RESTAURANT_INVENTORY_REPORT_EXPORTED') export(@Req() r: RequestWithUser, @Param('type') type: string, @Query() query: any) { return this.reports.exportCsv(r.tenant!.id, r.user.sub, type, query); }
}
