import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { RestaurantPurchasingService } from './restaurant-purchasing.service';
import { ApproveDifferenceDto, CreateRestaurantPurchaseOrderDto, PurchaseSuggestionQueryDto, ReceiveRestaurantPurchaseOrderDto, RejectPurchaseOrderDto, UpdateRestaurantPurchaseOrderDto } from './dto/restaurant-inventory.dto';
import { AuditAction } from '../audit/audit-action.decorator';
import { UseInterceptors } from '@nestjs/common';
import { RestaurantInventoryResponseInterceptor } from './restaurant-inventory-response.interceptor';
import { RestaurantInventoryIdempotencyInterceptor } from './restaurant-inventory-idempotency.interceptor';

@Controller('restaurant-inventory')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard, RestaurantInventoryContextGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
@UseInterceptors(RestaurantInventoryResponseInterceptor, RestaurantInventoryIdempotencyInterceptor)
export class RestaurantPurchasingController {
  constructor(private readonly service: RestaurantPurchasingService) {}
  @Post('purchase-orders') @RequirePermissions('restaurant_inventory.purchase_orders.create') @AuditAction('RESTAURANT_PURCHASE_ORDER_CREATED') create(@Req() r: RequestWithUser, @Body() dto: CreateRestaurantPurchaseOrderDto) { return this.service.create(r.tenant!.id, r.user.sub, dto); }
  @Get('purchase-orders') @RequirePermissions('inventory.read') list(@Req() r: RequestWithUser, @Query() query: any) { return this.service.list(r.tenant!.id, query); }
  @Get('purchase-orders/:id') @RequirePermissions('inventory.read') get(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.get(r.tenant!.id, id); }
  @Patch('purchase-orders/:id') @RequirePermissions('restaurant_inventory.purchase_orders.update') @AuditAction('RESTAURANT_PURCHASE_ORDER_UPDATED') update(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateRestaurantPurchaseOrderDto) { return this.service.update(r.tenant!.id, r.user.sub, id, dto); }
  @Post('purchase-orders/:id/submit') @RequirePermissions('restaurant_inventory.purchase_orders.submit') submit(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.transition(r.tenant!.id, r.user.sub, id, 'submit'); }
  @Post('purchase-orders/:id/approve') @RequirePermissions('restaurant_inventory.purchase_orders.approve') approve(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.transition(r.tenant!.id, r.user.sub, id, 'approve'); }
  @Post('purchase-orders/:id/reject') @RequirePermissions('restaurant_inventory.purchase_orders.reject') reject(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: RejectPurchaseOrderDto) { return this.service.transition(r.tenant!.id, r.user.sub, id, 'reject', dto.reason); }
  @Post('purchase-orders/:id/cancel') @RequirePermissions('restaurant_inventory.purchase_orders.cancel') cancel(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: RejectPurchaseOrderDto) { return this.service.transition(r.tenant!.id, r.user.sub, id, 'cancel', dto.reason); }
  @Post('purchase-orders/:id/receive') @RequirePermissions('restaurant_inventory.purchase_orders.receive') @AuditAction('RESTAURANT_PURCHASE_ORDER_RECEIVED') receive(@Req() r: RequestWithUser, @Param('id') id: string, @Body() dto: ReceiveRestaurantPurchaseOrderDto) { return this.service.receive(r.tenant!.id, r.user.sub, id, dto, r.user.permissions.includes('inventory.override')); }
  @Get('purchase-orders/:id/differences') @RequirePermissions('inventory.read') differences(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.differences(r.tenant!.id, id); }
  @Post('purchase-orders/:id/differences/:differenceId/approve') @RequirePermissions('restaurant_inventory.invoices.approve') approveDifference(@Req() r: RequestWithUser, @Param('id') id: string, @Param('differenceId') differenceId: string, @Body() dto: ApproveDifferenceDto) { return this.service.resolveDifference(r.tenant!.id, r.user.sub, id, differenceId, 'approve', dto.reason); }
  @Post('purchase-orders/:id/differences/:differenceId/reject') @RequirePermissions('restaurant_inventory.invoices.approve') rejectDifference(@Req() r: RequestWithUser, @Param('id') id: string, @Param('differenceId') differenceId: string, @Body() dto: ApproveDifferenceDto) { return this.service.resolveDifference(r.tenant!.id, r.user.sub, id, differenceId, 'reject', dto.reason); }
  @Get('price-history') @RequirePermissions('restaurant_inventory.price_history.view') priceHistory(@Req() r: RequestWithUser, @Query() query: any) { return this.service.priceHistory(r.tenant!.id, query); }
  @Get('purchase-suggestions') @RequirePermissions('restaurant_inventory.purchase_suggestions.view') suggestions(@Req() r: RequestWithUser, @Query() query: PurchaseSuggestionQueryDto) { return this.service.suggestions(r.tenant!.id, query); }
  @Post('purchase-suggestions/convert') @RequirePermissions('restaurant_inventory.purchase_orders.create') convert(@Req() r: RequestWithUser, @Body() dto: PurchaseSuggestionQueryDto & { ingredientIds?: string[]; supplierId?: string }) { return this.service.convertSuggestion(r.tenant!.id, r.user.sub, dto); }
}
