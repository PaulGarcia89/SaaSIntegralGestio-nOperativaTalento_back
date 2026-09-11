import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CalendarProvider } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CompanyCalendarSettingsService, CompanyCalendarCredentialsDto, CompanyInterviewSettingsDto } from './company-calendar-settings.service';
import { InterviewCalendarService } from './interview-calendar.service';
import { CalendarAuthorizationQueryDto, CalendarOAuthDto } from './dto/recruitment.dto';

@Controller('company/calendar-settings')
@UseGuards(JwtAuthGuard, TenantGuard, SubscriptionGuard, ScopeGuard, PermissionGuard)
export class CompanyCalendarController {
  constructor(private readonly settings: CompanyCalendarSettingsService, private readonly calendars: InterviewCalendarService) {}
  @Get() @RequirePermissions('tenants.read') get(@Req() req: RequestWithUser) { return this.settings.get(req.tenant!.id, true); }
  @Get('defaults') @RequirePermissions('applications.read') defaults(@Req() req: RequestWithUser) { return this.settings.get(req.tenant!.id); }
  @Put() @RequirePermissions('tenants.update') save(@Req() req: RequestWithUser, @Body() dto: CompanyInterviewSettingsDto) { return this.settings.saveDefaults(req.tenant!.id, dto); }
  @Put(':provider') @RequirePermissions('tenants.update') credentials(@Req() req: RequestWithUser, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider, @Body() dto: CompanyCalendarCredentialsDto) { return this.settings.saveCredentials(req.tenant!.id, provider, dto); }
  @Get(':provider/authorize') @RequirePermissions('tenants.update') authorize(@Req() req: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider, @Query() dto: CalendarAuthorizationQueryDto) { return this.calendars.getAuthorizationUrl(req.tenant!.id, actor, provider, dto.redirectUri, true); }
  @Post(':provider/oauth') @RequirePermissions('tenants.update') complete(@Req() req: RequestWithUser, @CurrentUser() actor: JwtPayload, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider, @Body() dto: CalendarOAuthDto) { return this.calendars.exchangeAuthorizationCode(req.tenant!.id, actor, provider, dto, true); }
  @Post(':provider/test') @RequirePermissions('tenants.update') test(@Req() req: RequestWithUser, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider) { return this.calendars.testCompanyConnection(req.tenant!.id, provider); }
  @Get(':provider/calendars') @RequirePermissions('tenants.update') list(@Req() req: RequestWithUser, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider) { return this.calendars.listCompanyCalendars(req.tenant!.id, provider); }
  @Delete(':provider') @RequirePermissions('tenants.update') disconnect(@Req() req: RequestWithUser, @Param('provider', new ParseEnumPipe(CalendarProvider)) provider: CalendarProvider) { return this.calendars.disconnectCompany(req.tenant!.id, provider); }
}
