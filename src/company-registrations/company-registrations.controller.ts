import { Body, Controller, Get, Headers, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalOnly } from '../common/decorators/global-only.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CompanyRegistrationsService } from './company-registrations.service';
import { CreateCompanyRegistrationDto } from './dto/create-company-registration.dto';
import { ReviewCompanyRegistrationDto } from './dto/review-company-registration.dto';

@Controller('public/company-registrations')
export class PublicCompanyRegistrationsController {
  constructor(private readonly service: CompanyRegistrationsService) {}

  @Post()
  submit(@Body() dto: CreateCompanyRegistrationDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @Ip() ip: string) {
    return this.service.submit({ ...dto, idempotencyKey: idempotencyKey ?? dto.idempotencyKey }, ip);
  }
}

@Controller('admin/company-registrations')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
@GlobalOnly()
export class AdminCompanyRegistrationsController {
  constructor(private readonly service: CompanyRegistrationsService) {}

  @Get()
  @RequirePermissions('tenants.read')
  list() {
    return this.service.list();
  }

  @Post(':id/approve')
  @RequirePermissions('tenants.create')
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: ReviewCompanyRegistrationDto) {
    return this.service.approve(id, user.sub, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('tenants.create')
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() dto: ReviewCompanyRegistrationDto) {
    return this.service.reject(id, user.sub, dto);
  }
}
