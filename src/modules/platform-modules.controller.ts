import { ModuleCode } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformModulesService } from './platform-modules.service';
import { CreatePlatformModuleDto } from './dto/create-platform-module.dto';
import { UpdatePlatformModuleDto } from './dto/update-platform-module.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('modules')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
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
