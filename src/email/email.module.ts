import { Module } from '@nestjs/common';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { EmployeeSensitiveDataCryptoService } from '../employees/employee-sensitive-data-crypto.service';
import { EmailSettingsController } from './email-settings.controller';
import { EmailSettingsService } from './email-settings.service';

@Module({
  controllers: [EmailSettingsController],
  providers: [EmailSettingsService, EmployeeSensitiveDataCryptoService, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard],
  exports: [EmailSettingsService],
})
export class EmailModule {}
