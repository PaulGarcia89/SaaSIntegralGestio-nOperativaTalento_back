import { Body, Controller, ForbiddenException, Get, Headers, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { LocalizationService } from './localization.service';
import { LocalizationSettingsDto, LocalePreferenceDto } from './dto/localization.dto';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller()
export class LocalizationController {
  constructor(private readonly service: LocalizationService, private readonly prisma: PrismaService) {}

  @Get('localization/config') config() { return this.service.global(); }
  @Get('career-portals/:portalSlug/localization') portal(@Param('portalSlug') slug: string) { return this.service.portal(slug); }
  @Get('career-portals/:portalSlug/localization/resolve') resolvePortal(@Param('portalSlug') slug: string, @Headers('x-locale') locale?: string) { return this.service.resolvePortal(slug, locale); }

  @UseGuards(JwtAuthGuard)
  @Patch('career-portals/:portalSlug/localization') updatePortal(@Param('portalSlug') slug: string, @Req() request: { user: JwtPayload }, @Body() dto: LocalizationSettingsDto) {
    return this.service.updatePortal(slug, dto, request.user.tenantId, request.user.sub, request.user.isSuperAdmin);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/localization') adminConfig(@Req() request: { user: JwtPayload }) {
    if (!request.user.isSuperAdmin) throw new ForbiddenException('Only super administrators can manage global localization');
    return this.service.global();
  }
  @UseGuards(JwtAuthGuard)
  @Patch('admin/localization') updateAdmin(@Req() request: { user: JwtPayload }, @Body() dto: LocalizationSettingsDto) {
    if (!request.user.isSuperAdmin) throw new ForbiddenException('Only super administrators can manage global localization');
    return this.service.updateGlobal(dto, request.user.sub);
  }
  @UseGuards(JwtAuthGuard)
  @Get('companies/:companyId/localization') company(@Param('companyId') id: string, @Req() request: { user: JwtPayload }) { if (request.user.tenantId !== id && !request.user.isSuperAdmin) throw new ForbiddenException('Company localization access denied'); return this.service.company(id); }
  @UseGuards(JwtAuthGuard)
  @Patch('companies/:companyId/localization') updateCompany(@Param('companyId') id: string, @Req() request: { user: JwtPayload }, @Body() dto: LocalizationSettingsDto) { return this.service.updateCompany(id, dto, request.user.tenantId, request.user.sub, request.user.isSuperAdmin); }
  @UseGuards(JwtAuthGuard)
  @Patch('me/preferences/locale') preference(@Req() request: { user: JwtPayload }, @Body() dto: LocalePreferenceDto) { return this.prisma.user.update({ where: { id: request.user.sub }, data: { preferredLocale: dto.locale } }); }
  @Get('me/preferences/locale') preferenceValue(@Req() request: { user: JwtPayload }) { return this.prisma.user.findUniqueOrThrow({ where: { id: request.user.sub }, select: { preferredLocale: true } }); }
}
