import { ModuleCode } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions('roles.create')
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.rolesService.create(dto, user, req.tenant!.id);
  }

  @Get()
  @RequirePermissions('roles.read')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.rolesService.findAll(user, req.tenant!.id);
  }

  @Get(':id')
  @RequirePermissions('roles.read')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.rolesService.findOne(id, user, req.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('roles.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithUser,
  ) {
    return this.rolesService.update(id, dto, user, req.tenant!.id);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.rolesService.remove(id, user, req.tenant!.id);
  }
}
