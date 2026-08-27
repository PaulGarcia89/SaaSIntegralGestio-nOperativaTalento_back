import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { RestaurantInventoryResponseInterceptor } from './restaurant-inventory-response.interceptor';
import { RestaurantInventoryAuditService } from './restaurant-inventory-audit.service';

@Controller('restaurant-inventory/audit-log')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@UseInterceptors(RestaurantInventoryResponseInterceptor)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class RestaurantInventoryAuditController {
  constructor(private readonly audit: RestaurantInventoryAuditService) {}
  @Get() @RequirePermissions('restaurant_inventory.audit.read') list(@Req() request: RequestWithUser, @Query() query: any) { return this.audit.list(request.tenant!.id, query); }
}
