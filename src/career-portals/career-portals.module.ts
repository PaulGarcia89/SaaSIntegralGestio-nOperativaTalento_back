import { Module } from '@nestjs/common';
import { CareerPortalsController } from './career-portals.controller';
import { CareerPortalsService } from './career-portals.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CareerPortalAccessGuard } from './career-portal-access.guard';

@Module({
  controllers: [CareerPortalsController],
  providers: [CareerPortalsService, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard, CareerPortalAccessGuard],
  exports: [CareerPortalsService],
})
export class CareerPortalsModule {}
