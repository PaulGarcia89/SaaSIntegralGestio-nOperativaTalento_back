import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TenantScoped } from '../common/decorators/tenant-scoped.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller(['roles', 'company/roles'])
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
@TenantScoped()
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
