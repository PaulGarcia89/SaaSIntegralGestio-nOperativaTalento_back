import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { ReportsController } from './reports.controller';
import { AtsAnalyticsService } from './ats-analytics.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, AtsAnalyticsService, PermissionGuard, TenantGuard, SubscriptionGuard],
})
export class ReportsModule {}
