import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { InventoryCapabilityCode } from '@prisma/client';
import { RequireInventoryCapability } from '../inventory-capabilities/inventory-capability.decorator';
import { InventoryCapabilityGuard } from '../inventory-capabilities/inventory-capability.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditAction } from '../audit/audit-action.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { RestaurantReportsService } from './restaurant-reports.service';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';
import { RestaurantReportQueryDto } from './dto/restaurant-inventory.dto';

@Controller('restaurant-inventory/reports')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class RestaurantReportsController {
  constructor(private readonly reports: RestaurantReportsService) {}
  @Get('advanced-dashboard') @RequireAnyPermission('inventory.view', 'inventory.read') advancedDashboard(@Req() r: RequestWithUser, @Query() query: RestaurantReportQueryDto) { return this.reports.advancedDashboard(r.tenant!.id, query); }
  @Get(':type') @RequireAnyPermission('inventory.view', 'inventory.read') report(@Req() r: RequestWithUser, @Param('type') type: string, @Query() query: RestaurantReportQueryDto) { return this.reports.report(r.tenant!.id, type, query); }
  @Get(':type/export') @RequirePermissions('inventory.report.view') @AuditAction('RESTAURANT_INVENTORY_REPORT_EXPORTED') export(@Req() r: RequestWithUser, @Param('type') type: string, @Query() query: RestaurantReportQueryDto) { return this.reports.exportCsv(r.tenant!.id, r.user.sub, type, query); }
}
