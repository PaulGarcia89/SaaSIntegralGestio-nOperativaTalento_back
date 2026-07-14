import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, PermissionGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('current')
  @RequirePermissions('tenants.read')
  getCurrentCompany(@CurrentUser() user: JwtPayload) {
    return this.companiesService.getCurrentCompany(user);
  }

  @Get('current/capabilities')
  @RequirePermissions('tenants.read')
  getCurrentCapabilities(@CurrentUser() user: JwtPayload) {
    return this.companiesService.getCurrentCapabilities(user);
  }

  @Patch('current')
  @RequirePermissions('tenants.update')
  updateCurrentCompany(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateCurrentCompany(user, dto);
  }
}
