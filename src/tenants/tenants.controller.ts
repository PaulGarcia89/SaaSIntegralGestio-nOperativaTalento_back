import { ModuleCode } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('tenants')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @RequirePermissions('tenants.create')
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.create(dto, user);
  }

  @Get()
  @RequirePermissions('tenants.read')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.findAll(user);
  }

  @Get(':id')
  @RequirePermissions('tenants.read')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermissions('tenants.update')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('tenants.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tenantsService.remove(id, user);
  }
}
