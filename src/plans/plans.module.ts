import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [PlansController],
  providers: [PlansService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [PlansService],
})
export class PlansModule {}
