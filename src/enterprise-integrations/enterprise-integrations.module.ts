import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { EnterpriseIntegrationsController } from './enterprise-integrations.controller';
import { EnterpriseIntegrationsService } from './enterprise-integrations.service';

@Module({
  controllers: [EnterpriseIntegrationsController],
  providers: [EnterpriseIntegrationsService, ScopeGuard, PermissionGuard],
  exports: [EnterpriseIntegrationsService],
})
export class EnterpriseIntegrationsModule {}
