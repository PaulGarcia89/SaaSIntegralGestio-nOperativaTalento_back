import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { GlobalOnly } from '../common/decorators/global-only.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { InventoryCapabilityCode } from '@prisma/client';
import { AuditAction } from '../audit/audit-action.decorator';
import { InventoryCapabilitiesService } from './inventory-capabilities.service';
import { SetInventoryCapabilityDto } from './dto/set-inventory-capability.dto';

@Controller('inventory-capabilities')
@UseGuards(JwtAuthGuard, TenantGuard, ScopeGuard, PermissionGuard)
export class InventoryCapabilitiesController {
  constructor(private readonly service: InventoryCapabilitiesService) {}

  @Get()
  @RequirePermissions('modules.read')
  list(@Req() request: RequestWithUser) {
    return this.service.list(request.tenant!.id);
  }

  @Patch(':code')
  @RequirePermissions('modules.update')
  @AuditAction('INVENTORY_CAPABILITY_UPDATED')
  update(
    @Req() request: RequestWithUser,
    @Param('code') code: InventoryCapabilityCode,
    @Body() dto: SetInventoryCapabilityDto,
  ) {
    return this.service.setEnabled(request.tenant!.id, code, dto.enabled, request.user.sub, dto.metadata);
  }

  @Patch('global/:tenantId/:code')
  @GlobalOnly()
  @RequirePermissions('modules.update')
  @AuditAction('INVENTORY_CAPABILITY_UPDATED_GLOBAL')
  updateGlobal(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Param('code') code: InventoryCapabilityCode,
    @Body() dto: SetInventoryCapabilityDto,
  ) {
    return this.service.setEnabled(tenantId, code, dto.enabled, user.sub, dto.metadata);
  }
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class InventoryModulesMeController {
  constructor(private readonly service: InventoryCapabilitiesService) {}

  @Get('modules')
  async modules(@CurrentUser() user: JwtPayload) {
    return {
      modules: user.enabledModules,
      inventoryCapabilities: await this.service.listForUser(user.activeTenantId ?? user.tenantId ?? null),
    };
  }
}
