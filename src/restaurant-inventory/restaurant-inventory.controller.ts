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
import { RestaurantInventoryService } from './restaurant-inventory.service';
import { CreateCategoryDto, CreateConsumptionDto, CreateIngredientDto, CreateReceiptDto, CreateRecipeDto, CreateSupplierDto, CreateUnitDto, CreateWarehouseDto, CreateWasteDto } from './dto/restaurant-inventory.dto';

@Controller('restaurant-inventory')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard, InventoryCapabilityGuard)
@RequireInventoryCapability(InventoryCapabilityCode.RESTAURANT_INVENTORY)
export class RestaurantInventoryController {
  constructor(private readonly service: RestaurantInventoryService) {}
  @Get('dashboard') @RequirePermissions('inventory.read') dashboard(@Req() r: RequestWithUser, @Query('branchId') branchId?: string, @Query('warehouseId') warehouseId?: string, @Query('from') from?: string, @Query('to') to?: string) { return this.service.dashboard(r.tenant!.id, { branchId, warehouseId, from, to }); }
  @Get('categories') @RequirePermissions('inventory.view') categories(@Req() r: RequestWithUser) { return this.service.categories(r.tenant!.id); }
  @Post('categories') @RequirePermissions('inventory.ingredient.manage') category(@Req() r: RequestWithUser, @Body() d: CreateCategoryDto) { return this.service.createCategory(r.tenant!.id, d); }
  @Get('units') @RequirePermissions('inventory.view') units(@Req() r: RequestWithUser) { return this.service.units(r.tenant!.id); }
  @Post('units') @RequirePermissions('inventory.ingredient.manage') unit(@Req() r: RequestWithUser, @Body() d: CreateUnitDto) { return this.service.createUnit(r.tenant!.id, d); }
  @Get('warehouses') @RequirePermissions('inventory.view') warehouses(@Req() r: RequestWithUser) { return this.service.warehouses(r.tenant!.id); }
  @Post('warehouses') @RequirePermissions('inventory.ingredient.manage') warehouse(@Req() r: RequestWithUser, @Body() d: CreateWarehouseDto) { return this.service.createWarehouse(r.tenant!.id, d); }
  @Get('suppliers') @RequirePermissions('inventory.view') suppliers(@Req() r: RequestWithUser) { return this.service.suppliers(r.tenant!.id); }
  @Post('suppliers') @RequirePermissions('inventory.supplier.manage') supplier(@Req() r: RequestWithUser, @Body() d: CreateSupplierDto) { return this.service.createSupplier(r.tenant!.id, d); }
  @Get('ingredients') @RequirePermissions('inventory.view') ingredients(@Req() r: RequestWithUser) { return this.service.ingredients(r.tenant!.id); }
  @Post('ingredients') @RequirePermissions('inventory.ingredient.manage') ingredient(@Req() r: RequestWithUser, @Body() d: CreateIngredientDto) { return this.service.createIngredient(r.tenant!.id, d); }
  @Get('recipes') @RequirePermissions('inventory.view') recipes(@Req() r: RequestWithUser) { return this.service.recipes(r.tenant!.id); }
  @Post('recipes') @RequirePermissions('inventory.recipe.manage') recipe(@Req() r: RequestWithUser, @Body() d: CreateRecipeDto) { return this.service.createRecipe(r.tenant!.id, r.user.sub, d); }
  @Patch('recipes/:id/activate') @RequirePermissions('inventory.recipe.manage') activateRecipe(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.activateRecipe(r.tenant!.id, id); }
  @Patch('recipes/:id/archive') @RequirePermissions('inventory.recipe.manage') archiveRecipe(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.archiveRecipe(r.tenant!.id, id); }
  @Post('receipts') @RequirePermissions('inventory.receipt.create') receipt(@Req() r: RequestWithUser, @Body() d: CreateReceiptDto) { return this.service.createReceipt(r.tenant!.id, r.user.sub, d); }
  @Post('receipts/:id/confirm') @RequirePermissions('inventory.receipt.confirm') confirmReceipt(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.confirmReceipt(r.tenant!.id, r.user.sub, id); }
  @Post('receipts/:id/cancel') @RequirePermissions('inventory.receipt.cancel') cancelReceipt(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancelReceipt(r.tenant!.id, r.user.sub, id); }
  @Post('consumptions/preview') @RequirePermissions('inventory.consumption.create') preview(@Req() r: RequestWithUser, @Body() d: CreateConsumptionDto) { return this.service.previewConsumption(r.tenant!.id, d); }
  @Post('consumptions') @RequirePermissions('inventory.consumption.create') consumption(@Req() r: RequestWithUser, @Body() d: CreateConsumptionDto) { return this.service.createConsumption(r.tenant!.id, r.user.sub, d); }
  @Post('consumptions/:id/confirm') @RequirePermissions('inventory.consumption.confirm') confirmConsumption(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.confirmConsumption(r.tenant!.id, r.user.sub, id, r.user.permissions.includes('inventory.negative_stock.override')); }
  @Post('consumptions/:id/cancel') @RequirePermissions('inventory.consumption.cancel') cancelConsumption(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancelConsumption(r.tenant!.id, r.user.sub, id); }
  @Post('wastes') @RequirePermissions('inventory.waste.create') waste(@Req() r: RequestWithUser, @Body() d: CreateWasteDto) { return this.service.createWaste(r.tenant!.id, r.user.sub, d); }
  @Post('wastes/:id/confirm') @RequirePermissions('inventory.waste.confirm') confirmWaste(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.confirmWaste(r.tenant!.id, r.user.sub, id); }
  @Post('wastes/:id/cancel') @RequirePermissions('inventory.waste.cancel') cancelWaste(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancelWaste(r.tenant!.id, r.user.sub, id); }
  @Get('balances') @RequirePermissions('inventory.view') balances(@Req() r: RequestWithUser, @Query('branchId') branchId?: string, @Query('warehouseId') warehouseId?: string) { return this.service.balances(r.tenant!.id, branchId, warehouseId); }
  @Get('movements') @RequirePermissions('inventory.movement.view') movements(@Req() r: RequestWithUser, @Query('ingredientId') ingredientId?: string) { return this.service.movements(r.tenant!.id, ingredientId); }
  @Get('alerts') @RequirePermissions('inventory.report.view') alerts(@Req() r: RequestWithUser) { return this.service.alerts(r.tenant!.id); }
  @Get('lots') @RequirePermissions('inventory.lot.view') lots(@Req() r: RequestWithUser, @Query('status') status?: string) { return this.service.lots(r.tenant!.id, status); }
  @Get('expiry-alerts') @RequirePermissions('inventory.report.view') expiryAlerts(@Req() r: RequestWithUser, @Query('days') days?: string) { return this.service.expiryAlerts(r.tenant!.id, Number(days) || 30); }
  @Post('productions') @RequirePermissions('inventory.production.create') production(@Req() r: RequestWithUser, @Body() d: any) { return this.service.createProduction(r.tenant!.id, r.user.sub, d); }
  @Post('productions/:id/confirm') @RequirePermissions('inventory.production.confirm') confirmProduction(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.confirmProduction(r.tenant!.id, r.user.sub, id); }
  @Post('productions/:id/cancel') @RequirePermissions('inventory.production.create') cancelProduction(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.cancelProduction(r.tenant!.id, r.user.sub, id); }
  @Post('stock-counts') @RequirePermissions('inventory.stock_count.create') stockCount(@Req() r: RequestWithUser, @Body() d: any) { return this.service.createStockCount(r.tenant!.id, r.user.sub, d); }
  @Post('stock-counts/:id/approve') @RequirePermissions('inventory.stock_count.approve', 'inventory.adjustment.approve') approveStockCount(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.approveStockCount(r.tenant!.id, r.user.sub, id); }
  @Post('transfers') @RequirePermissions('inventory.transfer.create') transfer(@Req() r: RequestWithUser, @Body() d: any) { return this.service.createTransfer(r.tenant!.id, r.user.sub, d); }
  @Post('transfers/:id/send') @RequirePermissions('inventory.transfer.send') sendTransfer(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.sendTransfer(r.tenant!.id, r.user.sub, id); }
  @Post('transfers/:id/receive') @RequirePermissions('inventory.transfer.receive') receiveTransfer(@Req() r: RequestWithUser, @Param('id') id: string) { return this.service.receiveTransfer(r.tenant!.id, r.user.sub, id); }
}
