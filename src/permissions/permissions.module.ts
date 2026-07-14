import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [PermissionsService],
})
export class PermissionsModule {}
