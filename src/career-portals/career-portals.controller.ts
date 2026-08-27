import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CareerPortalsService } from './career-portals.service';
import { ListPublicVacanciesDto } from '../vacancies/dto/list-public-vacancies.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { TenantScoped } from '../common/decorators/tenant-scoped.decorator';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { UpdateCareerPortalsConfigDto } from './dto/career-portals-config.dto';
import { CareerPortalAccessGuard } from './career-portal-access.guard';
import { ApplicantAuthGuard, ApplicantRequest } from '../applications/applicant-auth.guard';
import { PortalInvitationTokenDto } from './dto/portal-invitation.dto';

@Controller('career-portals')
export class CareerPortalsController {
  constructor(private readonly service: CareerPortalsService) {}

  @Get('resolve')
  resolve(@Req() request: Request, @Query('slug') slug?: string, @Query('pathname') pathname?: string) {
    return this.service.resolve({ host: request.headers.host, path: pathname ?? request.path, slug });
  }

  // Keep the frontend's marketplace alias public while the canonical endpoint remains /public/vacancies.
  @Get('marketplace/vacancies')
  marketplaceList(@Query() query: ListPublicVacanciesDto, @Headers('x-locale') locale?: string) {
    return this.service.listPublicVacancies(undefined, query, locale);
  }

  @Get('marketplace/vacancies/:publicSlug')
  marketplaceDetail(@Param('publicSlug') publicSlug: string, @Headers('x-locale') locale?: string) {
    return this.service.getPublicVacancy(publicSlug, undefined, locale);
  }

  @Get(':slug/vacancies')
  @UseGuards(CareerPortalAccessGuard)
  list(@Param('slug') slug: string, @Query() query: ListPublicVacanciesDto, @Headers('x-locale') locale?: string) {
    return this.service.listPublicVacancies(slug, query, locale);
  }

  @Get(':slug/vacancies/:publicSlug')
  @UseGuards(CareerPortalAccessGuard)
  detail(@Param('slug') slug: string, @Param('publicSlug') publicSlug: string, @Headers('x-locale') locale?: string) {
    return this.service.getPublicVacancy(publicSlug, slug, locale);
  }

  @Post(':slug/invitations/validate')
  validateInvitation(@Param('slug') slug: string, @Body() dto: PortalInvitationTokenDto) {
    return this.service.validateInvitation(slug, dto.token);
  }

  @Post(':slug/invitations/accept')
  @UseGuards(ApplicantAuthGuard)
  acceptInvitation(@Param('slug') slug: string, @Body() dto: PortalInvitationTokenDto, @Req() request: ApplicantRequest) {
    return this.service.acceptInvitation(slug, dto.token, request.applicant.sub);
  }

  @Get('config')
  @UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermissions('tenants.read')
  config(@Req() request: RequestWithUser) {
    return this.service.getConfig(request.tenant!.id);
  }

  @Put('config')
  @UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermissions('tenants.update')
  updateConfig(@Req() request: RequestWithUser, @Body() dto: UpdateCareerPortalsConfigDto) {
    return this.service.updateConfig(request.tenant!.id, dto);
  }
}
