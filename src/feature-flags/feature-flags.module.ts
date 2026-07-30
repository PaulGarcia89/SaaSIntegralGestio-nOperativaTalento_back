import { Module } from '@nestjs/common';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard],
})
export class FeatureFlagsModule {}
