import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [RolesService],
})
export class RolesModule {}
