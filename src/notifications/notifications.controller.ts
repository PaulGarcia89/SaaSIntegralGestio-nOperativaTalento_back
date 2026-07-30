import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ListNotificationDeliveriesDto } from './dto/list-notification-deliveries.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications.read_own')
  findAll(@CurrentUser() user: JwtPayload, @Query() query: ListNotificationsDto) {
    return this.notificationsService.findAll(user, query);
  }

  @Post()
  @RequirePermissions('notifications.send')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(user, dto);
  }

  @Patch(':id/read')
  @RequirePermissions('notifications.update_own')
  markAsRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user, id);
  }

  @Patch('read-all')
  @RequirePermissions('notifications.update_own')
  markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Patch(':id/archive')
  @RequirePermissions('notifications.update_own')
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.archive(user, id);
  }

  @Delete(':id')
  @RequirePermissions('notifications.update_own')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.remove(user, id);
  }

  @Get('preferences/me')
  @RequirePermissions('notifications.read_own')
  getPreferences(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getPreferences(user);
  }

  @Patch('preferences/me')
  @RequirePermissions('notifications.update_own')
  updatePreference(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.updatePreference(user, dto);
  }

  @Get('deliveries')
  @RequirePermissions('notifications.read_own')
  listDeliveries(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationDeliveriesDto,
  ) {
    return this.notificationsService.listDeliveries(user, query);
  }

  @Post('deliveries/:id/retry')
  @RequirePermissions('notifications.update_own')
  retryDelivery(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.retryDelivery(user, id);
  }
}
