import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { TenantScoped } from '../common/decorators/tenant-scoped.decorator';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller(['companies', 'company'])
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
@TenantScoped()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get(['current', 'settings'])
  @RequirePermissions('tenants.read')
  getCurrentCompany(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.companiesService.getCurrentCompany(user, req.tenant!.id);
  }

  @Get(['current/capabilities', 'settings/capabilities'])
  @RequirePermissions('tenants.read')
  getCurrentCapabilities(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser) {
    return this.companiesService.getCurrentCapabilities(user, req.tenant!.id);
  }

  @Patch(['current', 'settings'])
  @RequirePermissions('tenants.update')
  updateCurrentCompany(@CurrentUser() user: JwtPayload, @Req() req: RequestWithUser, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateCurrentCompany(user, req.tenant!.id, dto);
  }
}
