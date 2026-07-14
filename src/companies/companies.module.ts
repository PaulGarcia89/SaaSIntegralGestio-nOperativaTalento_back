import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, TenantGuard, SubscriptionGuard, PermissionGuard],
})
export class CompaniesModule {}
