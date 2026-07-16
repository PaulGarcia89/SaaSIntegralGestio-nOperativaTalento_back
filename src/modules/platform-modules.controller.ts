import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformModulesService } from './platform-modules.service';
import { CreatePlatformModuleDto } from './dto/create-platform-module.dto';
import { UpdatePlatformModuleDto } from './dto/update-platform-module.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GlobalOnly } from '../common/decorators/global-only.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller(['modules', 'admin/modules'])
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
@GlobalOnly()
export class PlatformModulesController {
  constructor(private readonly platformModulesService: PlatformModulesService) {}

  @Post()
  @RequirePermissions('modules.create')
  create(@Body() dto: CreatePlatformModuleDto, @CurrentUser() user: JwtPayload) {
    return this.platformModulesService.create(dto, user);
  }

  @Get()
  @RequirePermissions('modules.read')
  findAll() {
    return this.platformModulesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('modules.read')
  findOne(@Param('id') id: string) {
    return this.platformModulesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('modules.update')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformModuleDto, @CurrentUser() user: JwtPayload) {
    return this.platformModulesService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('modules.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.platformModulesService.remove(id, user);
  }
}
