import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, TenantGuard, SubscriptionGuard, PermissionGuard],
})
export class NotificationsModule {}
