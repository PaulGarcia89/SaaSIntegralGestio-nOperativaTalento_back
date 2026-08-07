import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { EnterpriseIntegrationsService } from './enterprise-integrations.service';

@Controller('enterprise-integrations')
@UseGuards(JwtAuthGuard, ScopeGuard, PermissionGuard)
@RequirePermissions('applications.read')
export class EnterpriseIntegrationsController {
  constructor(private readonly service: EnterpriseIntegrationsService) {}

  @Get()
  list() { return this.service.describe(); }
}
