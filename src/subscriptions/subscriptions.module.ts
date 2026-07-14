import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
