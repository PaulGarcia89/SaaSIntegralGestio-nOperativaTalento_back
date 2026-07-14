import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
