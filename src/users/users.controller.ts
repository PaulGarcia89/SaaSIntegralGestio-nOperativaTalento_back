import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { TenantScoped } from '../common/decorators/tenant-scoped.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';

@Controller(['users', 'company/users'])
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
@TenantScoped()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.usersService.create(dto, user, req.tenant!.id);
  }

  @Get()
  @RequirePermissions('users.read')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.usersService.findAll(user, req.tenant!.id);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.usersService.findOne(id, user, req.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.update(id, dto, user, req.tenant!.id);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.usersService.remove(id, user, req.tenant!.id);
  }
}
