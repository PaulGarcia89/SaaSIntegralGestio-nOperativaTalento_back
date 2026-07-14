import { Module } from '@nestjs/common';
import { PlatformModulesController } from './platform-modules.controller';
import { PlatformModulesService } from './platform-modules.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [PlatformModulesController],
  providers: [PlatformModulesService, TenantGuard, SubscriptionGuard, ModuleAccessGuard, PermissionGuard],
  exports: [PlatformModulesService],
})
export class PlatformModulesModule {}
