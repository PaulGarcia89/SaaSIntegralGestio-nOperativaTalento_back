import { ModuleCode } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequireModule } from '../common/decorators/module-access.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard)
@RequireModule(ModuleCode.ATS)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @RequirePermissions('subscriptions.create')
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.create(dto, user);
  }

  @Get()
  @RequirePermissions('subscriptions.read')
  findAll(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.subscriptionsService.findAll(user, req.tenant!.id);
  }

  @Get(':id')
  @RequirePermissions('subscriptions.read')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.subscriptionsService.findOne(id, user, req.tenant!.id);
  }

  @Patch(':id')
  @RequirePermissions('subscriptions.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subscriptionsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('subscriptions.delete')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.remove(id, user);
  }
}
