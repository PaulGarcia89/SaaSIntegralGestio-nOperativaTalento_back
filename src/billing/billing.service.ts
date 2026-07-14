import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PlatformAccessService } from '../platform/platform-access.service';
import { UpsertBillingCustomerDto } from './dto/upsert-billing-customer.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async getOverview(actor: JwtPayload) {
    const [capabilities, billingCustomer, invoices] = await Promise.all([
      this.platformAccessService.getTenantCapabilities(actor.tenantId),
      this.prisma.billingCustomer.findUnique({
        where: { tenantId: actor.tenantId },
      }),
      this.prisma.billingInvoice.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { issuedAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      billingCustomer,
      subscription: capabilities.subscription,
      plan: capabilities.plan,
      recentInvoices: invoices,
      enabledModules: capabilities.enabledModules,
    };
  }

  findInvoices(actor: JwtPayload) {
    return this.prisma.billingInvoice.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async upsertCustomer(actor: JwtPayload, dto: UpsertBillingCustomerDto) {
    const billingCustomer = await this.prisma.billingCustomer.upsert({
      where: { tenantId: actor.tenantId },
      update: {
        provider: dto.provider,
        externalCustomerId: dto.externalCustomerId,
        email: dto.email,
        name: dto.name,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      create: {
        tenantId: actor.tenantId,
        provider: dto.provider,
        externalCustomerId: dto.externalCustomerId,
        email: dto.email,
        name: dto.name,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.subscription.updateMany({
      where: { tenantId: actor.tenantId },
      data: {
        billingProvider: dto.provider,
        billingCustomerId: dto.externalCustomerId,
      },
    });

    return billingCustomer;
  }
}
