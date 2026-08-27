import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocalizationEmailPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { LocalizationSettingsDto } from './dto/localization.dto';

export type SupportedLocale = 'es' | 'en';

@Injectable()
export class LocalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async global() {
    const settings = await this.prisma.platformLocalizationSettings.findFirst();
    return settings ?? { defaultLocale: 'es', fallbackLocale: 'es', enabledLocales: ['es', 'en'], allowCompanyLocaleConfiguration: true, detectBrowserLocale: true, defaultTimeZone: 'UTC' };
  }

  async updateGlobal(dto: LocalizationSettingsDto, actorId?: string) {
    const current = await this.global();
    const enabled = this.normalizeLocales(dto.enabledLocales ?? this.locales(current.enabledLocales));
    const fallback = (dto.fallbackLocale ?? current.fallbackLocale) as SupportedLocale;
    const defaultLocale = (dto.defaultLocale ?? current.defaultLocale) as SupportedLocale;
    this.validate(enabled, defaultLocale, fallback);
    const data = {
      defaultLocale,
      fallbackLocale: fallback,
      enabledLocales: enabled as Prisma.InputJsonValue,
      allowCompanyLocaleConfiguration: dto.useCompanySettings ?? true,
      detectBrowserLocale: dto.detectBrowserLocale ?? true,
      defaultTimeZone: dto.defaultTimeZone ?? 'UTC',
      defaultDateFormat: dto.dateFormat,
      defaultTimeFormat: dto.timeFormat,
      updatedBy: actorId,
    };
    if ('id' in current && current.id) {
      return this.prisma.platformLocalizationSettings.update({ where: { id: current.id }, data });
    }
    return this.prisma.platformLocalizationSettings.create({ data });
  }

  async company(tenantId: string) {
    const row = await this.prisma.companyLocalizationSettings.findUnique({ where: { tenantId } });
    if (row) return row;
    return this.prisma.companyLocalizationSettings.create({ data: { tenantId, enabledLocales: ['es'] } });
  }

  async updateCompany(tenantId: string, dto: LocalizationSettingsDto, actorTenantId: string, actorId?: string, isSuperAdmin = false) {
    if (!isSuperAdmin && tenantId !== actorTenantId) throw new ForbiddenException('Company localization access denied');
    const global = await this.global();
    const enabledGlobal = this.normalizeLocales(global.enabledLocales);
    const enabled = this.normalizeLocales(dto.enabledLocales ?? ['es']);
    if (enabled.some((locale) => !enabledGlobal.includes(locale))) throw new BadRequestException('Company locale is not enabled globally');
    const fallback = (dto.fallbackLocale ?? 'es') as SupportedLocale;
    const defaultLocale = (dto.defaultLocale ?? 'es') as SupportedLocale;
    this.validate(enabled, defaultLocale, fallback);
    const data = {
      defaultLocale,
      fallbackLocale: fallback,
      enabledLocales: enabled as Prisma.InputJsonValue,
      showLanguageSelector: dto.showLanguageSelector ?? true,
      detectBrowserLocale: dto.detectBrowserLocale ?? true,
      emailLocalePolicy: dto.emailLocalePolicy ?? LocalizationEmailPolicy.RECIPIENT_PREFERENCE,
      defaultTimeZone: dto.defaultTimeZone ?? 'UTC',
      dateFormat: dto.dateFormat,
      timeFormat: dto.timeFormat,
      updatedBy: actorId,
    };
    return this.prisma.companyLocalizationSettings.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
  }

  async portal(slug: string) {
    const portal = await this.prisma.careerPortal.findFirst({ where: { OR: [{ slug }, { tenant: { slug } }], isActive: true }, include: { localizationSettings: true } });
    if (!portal) throw new NotFoundException('Career portal not found');
    return portal.localizationSettings ?? { defaultLocale: 'es', fallbackLocale: 'es', enabledLocales: ['es'], useCompanySettings: true, showLanguageSelector: true, detectBrowserLocale: true };
  }

  async updatePortal(slug: string, dto: LocalizationSettingsDto, actorTenantId: string, actorId?: string, isSuperAdmin = false) {
    const portal = await this.prisma.careerPortal.findFirst({ where: { OR: [{ slug }, { tenant: { slug } }], isActive: true }, select: { id: true, tenantId: true } });
    if (!portal) throw new NotFoundException('Career portal not found');
    if (!isSuperAdmin && portal.tenantId !== actorTenantId) throw new ForbiddenException('Career portal localization access denied');
    const global = await this.global();
    const enabledGlobal = this.normalizeLocales(global.enabledLocales);
    const enabled = this.normalizeLocales(dto.enabledLocales ?? ['es']);
    if (enabled.some((locale) => !enabledGlobal.includes(locale))) throw new BadRequestException('Portal locale is not enabled globally');
    const fallback = (dto.fallbackLocale ?? 'es') as SupportedLocale;
    const defaultLocale = (dto.defaultLocale ?? 'es') as SupportedLocale;
    this.validate(enabled, defaultLocale, fallback);
    return this.prisma.careerPortalLocalizationSettings.upsert({
      where: { careerPortalId: portal.id },
      update: { defaultLocale, fallbackLocale: fallback, enabledLocales: enabled as Prisma.InputJsonValue, showLanguageSelector: dto.showLanguageSelector ?? true, detectBrowserLocale: dto.detectBrowserLocale ?? true, useCompanySettings: dto.useCompanySettings ?? true, updatedBy: actorId },
      create: { careerPortalId: portal.id, defaultLocale, fallbackLocale: fallback, enabledLocales: enabled as Prisma.InputJsonValue, showLanguageSelector: dto.showLanguageSelector ?? true, detectBrowserLocale: dto.detectBrowserLocale ?? true, useCompanySettings: dto.useCompanySettings ?? true, updatedBy: actorId },
    });
  }

  async resolvePortal(slug: string, requested: unknown) {
    const portal = await this.prisma.careerPortal.findFirst({ where: { OR: [{ slug }, { tenant: { slug } }], isActive: true }, include: { localizationSettings: true, tenant: { include: { localizationSettings: true } } } });
    if (!portal) throw new NotFoundException('Career portal not found');
    const global = await this.global();
    const settings = portal.localizationSettings ?? (portal.tenant?.localizationSettings ?? global);
    const enabled = this.normalizeLocales(settings.enabledLocales);
    const fallback = settings.fallbackLocale === 'en' ? 'en' : 'es';
    return { locale: this.resolve(requested, enabled.length ? enabled : ['es'], fallback), fallbackLocale: fallback, enabledLocales: enabled.length ? enabled : ['es'] };
  }

  resolve(requested: unknown, enabled: string[], fallback: SupportedLocale = 'es'): SupportedLocale {
    const normalized = typeof requested === 'string' ? requested.toLowerCase().split('-')[0] : '';
    return (enabled.includes(normalized) ? normalized : enabled.includes(fallback) ? fallback : 'es') as SupportedLocale;
  }

  private normalizeLocales(value: unknown): SupportedLocale[] { return [...new Set(Array.isArray(value) ? value.filter((item): item is SupportedLocale => item === 'es' || item === 'en') : [])]; }
  private locales(value: unknown) { return this.normalizeLocales(value).length ? this.normalizeLocales(value) : ['es', 'en'] as SupportedLocale[]; }
  private validate(enabled: SupportedLocale[], defaultLocale: SupportedLocale, fallback: SupportedLocale) { if (!enabled.length || !enabled.includes(defaultLocale) || !enabled.includes(fallback)) throw new BadRequestException('Invalid localization locale configuration'); }
}
