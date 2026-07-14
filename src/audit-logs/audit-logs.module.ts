import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, TenantGuard, SubscriptionGuard, PermissionGuard],
})
export class AuditLogsModule {}
