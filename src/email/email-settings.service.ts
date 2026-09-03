import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmployeeSensitiveDataCryptoService } from '../employees/employee-sensitive-data-crypto.service';
import { UpdateEmailSettingsDto } from './email-settings.dto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { lookup } from 'node:dns/promises';

@Injectable()
export class EmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EmployeeSensitiveDataCryptoService,
  ) {}

  async get(tenantId: string) {
    const settings = await this.prisma.tenantEmailSettings.findUnique({ where: { tenantId } });
    if (!settings) return null;
    return {
      id: settings.id,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpSecure: settings.smtpSecure,
      smtpUsername: settings.smtpUsername,
      passwordConfigured: Boolean(settings.smtpPasswordEncrypted),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      enabled: settings.enabled,
      lastTestedAt: settings.lastTestedAt,
      lastTestStatus: settings.lastTestStatus,
      lastTestError: settings.lastTestError,
      updatedAt: settings.updatedAt,
    };
  }

  async save(tenantId: string, dto: UpdateEmailSettingsDto) {
    const current = await this.prisma.tenantEmailSettings.findUnique({ where: { tenantId } });
    const password = dto.smtpPassword?.trim();
    if (!current && !password) throw new BadRequestException('SMTP_PASSWORD is required for the first configuration');
    const saved = await this.prisma.tenantEmailSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        smtpHost: dto.smtpHost.trim(),
        smtpPort: dto.smtpPort,
        smtpSecure: dto.smtpSecure,
        smtpUsername: dto.smtpUsername.trim(),
        smtpPasswordEncrypted: this.crypto.encrypt(password!),
        fromName: dto.fromName.trim(),
        fromEmail: dto.fromEmail.trim().toLowerCase(),
        enabled: dto.enabled,
      },
      update: {
        smtpHost: dto.smtpHost.trim(),
        smtpPort: dto.smtpPort,
        smtpSecure: dto.smtpSecure,
        smtpUsername: dto.smtpUsername.trim(),
        ...(password ? { smtpPasswordEncrypted: this.crypto.encrypt(password) } : {}),
        fromName: dto.fromName.trim(),
        fromEmail: dto.fromEmail.trim().toLowerCase(),
        enabled: dto.enabled,
        lastTestStatus: null,
        lastTestError: null,
      },
    });
    return this.get(saved.tenantId);
  }

  async test(tenantId: string, recipient: string) {
    const settings = await this.prisma.tenantEmailSettings.findUnique({ where: { tenantId } });
    if (!settings) throw new BadRequestException('Configura el SMTP de la empresa antes de enviar una prueba');
    try {
      const transport = await this.createTransport(settings);
      const result = await transport.sendMail({
        from: `${settings.fromName} <${settings.fromEmail}>`,
        to: recipient,
        subject: 'Prueba de configuración de correo',
        text: `La configuración SMTP de ${settings.fromName} funciona correctamente.`,
      });
      await this.prisma.tenantEmailSettings.update({ where: { tenantId }, data: { lastTestedAt: new Date(), lastTestStatus: 'SUCCESS', lastTestError: null } });
      return { success: true, messageId: result.messageId, recipient };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'No fue posible conectar con el SMTP';
      await this.prisma.tenantEmailSettings.update({ where: { tenantId }, data: { lastTestedAt: new Date(), lastTestStatus: 'FAILED', lastTestError: message } });
      throw new BadRequestException(`No fue posible enviar el correo de prueba: ${message}`);
    }
  }

  async sendCustom(tenantId: string, input: { recipient: string; subject: string; text: string; html: string }) {
    const settings = await this.prisma.tenantEmailSettings.findUnique({ where: { tenantId } });
    if (!settings || !settings.enabled) throw new BadRequestException('El SMTP de la empresa no está habilitado');
    const transport = await this.createTransport(settings);
    const result = await transport.sendMail({ from: `${settings.fromName} <${settings.fromEmail}>`, to: input.recipient, subject: input.subject, text: input.text, html: input.html });
    return { messageId: result.messageId };
  }

  async transportForTenant(tenantId: string) {
    const settings = await this.prisma.tenantEmailSettings.findUnique({ where: { tenantId } });
    if (!settings || !settings.enabled) return null;
    return {
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      user: settings.smtpUsername,
      password: this.crypto.decrypt(settings.smtpPasswordEncrypted),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
    };
  }

  private async createTransport(settings: { smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string; smtpPasswordEncrypted: string }) {
    const family = Number(process.env.SMTP_FAMILY?.trim() || '4') as 4 | 6;
    const host = family === 4 ? (await lookup(settings.smtpHost, { family: 4 })).address : settings.smtpHost;
    const transportOptions: SMTPTransport.Options & { family: 4 | 6 } = { host, port: settings.smtpPort, secure: settings.smtpSecure, family, auth: { user: settings.smtpUsername, pass: this.crypto.decrypt(settings.smtpPasswordEncrypted) }, tls: { servername: settings.smtpHost }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 };
    return nodemailer.createTransport(transportOptions);
  }
}
