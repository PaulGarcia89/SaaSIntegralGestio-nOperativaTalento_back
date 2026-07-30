import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { NotificationDeliverySchedulerService } from './notification-delivery-scheduler.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliverySchedulerService,
    TenantGuard,
    SubscriptionGuard,
    PermissionGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
