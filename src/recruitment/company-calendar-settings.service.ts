import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarProvider } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CalendarTokenCryptoService } from './calendar-token-crypto.service';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, Matches } from 'class-validator';

export class CompanyInterviewSettingsDto {
  @IsIn(['GOOGLE_MEET', 'MICROSOFT_TEAMS', 'PRESENTIAL', 'CUSTOM', 'PHONE']) defaultModality!: string;
  @IsInt() @Min(15) @Max(480) durationMinutes!: number;
  @IsInt() @Min(0) @Max(10080) reminderMinutes!: number;
  @IsString() @MaxLength(100) timezone!: string;
}
export class CompanyCalendarCredentialsDto {
  @IsOptional() @IsString() @MaxLength(500) clientId?: string;
  @IsOptional() @IsString() @MaxLength(2000) clientSecret?: string;
  @IsOptional() @Matches(/^(common|organizations|consumers|[a-zA-Z0-9.-]+)$/) authority?: string;
  @IsOptional() @IsString() @MaxLength(1000) calendarId?: string;
}

@Injectable()
export class CompanyCalendarSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CalendarTokenCryptoService) {}
  async get(tenantId: string, admin = false) {
    const [settings, providers] = await Promise.all([
      this.prisma.tenantInterviewSettings.findUnique({ where: { tenantId } }),
      this.prisma.tenantCalendarProviderSettings.findMany({ where: { tenantId } }),
    ]);
    return {
      defaults: settings ?? { defaultModality: 'CUSTOM', durationMinutes: 60, reminderMinutes: 60, timezone: 'America/New_York' },
      providers: await Promise.all([CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT].map(async (provider) => {
        const config = providers.find((p) => p.provider === provider);
        const connection = config?.connectionId ? await this.prisma.atsCalendarConnection.findFirst({ where: { id: config.connectionId, tenantId, provider }, select: { externalEmail: true, status: true, lastSyncedAt: true } }) : null;
        const prefix = provider === 'GOOGLE' ? 'GOOGLE_CALENDAR' : 'MICROSOFT_CALENDAR';
        return { provider, configured: Boolean((config?.clientId && config?.clientSecretEncrypted) || (process.env[`${prefix}_CLIENT_ID`] && process.env[`${prefix}_CLIENT_SECRET`])), connected: connection?.status === 'ACTIVE', email: connection?.externalEmail ?? null, lastSyncedAt: connection?.lastSyncedAt ?? null, ...(admin ? { clientId: config?.clientId ?? '', hasClientSecret: Boolean(config?.clientSecretEncrypted), authority: config?.authority ?? 'common', calendarId: config?.calendarId ?? 'primary' } : {}) };
      })),
    };
  }
  async saveDefaults(tenantId: string, dto: CompanyInterviewSettingsDto) {
    try { new Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format(); } catch { throw new BadRequestException('Selecciona una zona horaria válida.'); }
    if (dto.defaultModality === 'GOOGLE_MEET' || dto.defaultModality === 'MICROSOFT_TEAMS') {
      const provider = dto.defaultModality === 'GOOGLE_MEET' ? 'GOOGLE' : 'MICROSOFT';
      const current = await this.get(tenantId);
      if (!current.providers.some((p) => p.provider === provider && p.connected)) throw new BadRequestException('Conecta la cuenta antes de elegirla como predeterminada.');
    }
    return this.prisma.tenantInterviewSettings.upsert({ where: { tenantId }, create: { tenantId, ...dto }, update: dto });
  }
  async saveCredentials(tenantId: string, provider: CalendarProvider, dto: CompanyCalendarCredentialsDto) {
    this.assertProvider(provider);
    const previous = await this.config(tenantId, provider);
    if (previous?.connectionId && (dto.clientSecret || (dto.clientId !== undefined && dto.clientId !== previous.clientId) || (dto.authority !== undefined && dto.authority !== previous.authority))) throw new BadRequestException('Desconecta la cuenta antes de cambiar sus credenciales OAuth.');
    const data = { clientId: dto.clientId?.trim() || undefined, clientSecretEncrypted: dto.clientSecret ? this.crypto.encrypt(dto.clientSecret) : undefined, authority: dto.authority, calendarId: dto.calendarId?.trim() || undefined };
    await this.prisma.tenantCalendarProviderSettings.upsert({ where: { tenantId_provider: { tenantId, provider } }, create: { tenantId, provider, ...data }, update: data });
    return this.get(tenantId, true);
  }
  config(tenantId: string, provider: CalendarProvider) { return this.prisma.tenantCalendarProviderSettings.findUnique({ where: { tenantId_provider: { tenantId, provider } } }); }
  async resolve(tenantId: string, userId: string, provider: CalendarProvider) {
    const config = await this.config(tenantId, provider);
    const connection = config?.connectionId
      ? await this.prisma.atsCalendarConnection.findFirst({ where: { id: config.connectionId, tenantId, provider, status: 'ACTIVE' } })
      : await this.prisma.atsCalendarConnection.findUnique({ where: { tenantId_userId_provider: { tenantId, userId, provider } } });
    if (!connection || connection.status !== 'ACTIVE') throw new BadRequestException('Conecta el calendario en Administración antes de agendar esta reunión.');
    return { connectionId: connection.id, calendarId: config?.connectionId ? config.calendarId : 'primary' };
  }
  assertProvider(provider: CalendarProvider) { if (!['GOOGLE', 'MICROSOFT'].includes(provider)) throw new BadRequestException('Proveedor de calendario no compatible.'); }
}
