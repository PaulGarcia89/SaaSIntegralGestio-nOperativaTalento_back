import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [BillingController],
  providers: [BillingService, TenantGuard, SubscriptionGuard, PermissionGuard],
})
export class BillingModule {}
