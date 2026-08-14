import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessScope, CompanyRegistrationStatus, PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCompanyRegistrationDto } from './dto/create-company-registration.dto';
import { ReviewCompanyRegistrationDto } from './dto/review-company-registration.dto';

const TERMS_VERSION = '2026-08-14';
const PRIVACY_VERSION = '2026-08-14';

@Injectable()
export class CompanyRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(dto: CreateCompanyRegistrationDto, requestIp?: string) {
    if (!dto.acceptTerms || !dto.acceptPrivacy) {
      throw new BadRequestException('Debes aceptar los términos y la política de privacidad.');
    }

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID();
    const existing = await this.prisma.companyRegistrationRequest.findUnique({ where: { idempotencyKey } });
    if (existing) return this.serialize(existing);

    const alreadyRegistered = await this.prisma.user.findFirst({ where: { email: adminEmail }, select: { id: true } });
    const pendingRequest = await this.prisma.companyRegistrationRequest.findFirst({
      where: { adminEmail, status: CompanyRegistrationStatus.PENDING },
      select: { id: true },
    });
    if (alreadyRegistered || pendingRequest) {
      throw new ConflictException('No fue posible procesar la solicitud con estos datos.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const item = await this.prisma.companyRegistrationRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        branchName: dto.branchName.trim(),
        branchLocation: dto.branchLocation.trim(),
        adminName: dto.adminName.trim(),
        adminEmail,
        passwordHash,
        plan: dto.plan,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        marketingConsent: dto.marketingConsent ?? false,
        requestIpHash: requestIp ? createHash('sha256').update(requestIp).digest('hex') : null,
        idempotencyKey,
      },
    });
    const superadmins = await this.prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, tenantId: true },
    });
    if (superadmins.length) {
      await this.prisma.notification.createMany({
        data: superadmins.map((admin) => ({
          tenantId: admin.tenantId,
          userId: admin.id,
          title: 'Nueva solicitud de empresa',
          message: `${item.companyName} solicita el plan ${item.plan}.`,
          sourceModule: 'company-registration',
          actionUrl: '/admin/company-registrations',
          correlationId: item.id,
          deduplicationKey: `company-registration:${item.id}:${admin.id}`,
        })),
        skipDuplicates: true,
      });
    }
    return this.serialize(item);
  }

  async list(status?: CompanyRegistrationStatus) {
    const items = await this.prisma.companyRegistrationRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return items.map((item) => this.serialize(item));
  }

  async approve(id: string, reviewerUserId: string, dto: ReviewCompanyRegistrationDto) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.companyRegistrationRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Solicitud de empresa no encontrada.');
      if (request.status !== CompanyRegistrationStatus.PENDING) {
        throw new ConflictException('La solicitud ya fue revisada.');
      }

      const plan = await tx.plan.findUnique({ where: { code: request.plan } });
      if (!plan) throw new BadRequestException('El plan solicitado no está disponible.');

      const slug = await this.nextSlug(tx, request.companyName);
      const [firstName, ...lastNameParts] = request.adminName.split(/\s+/).filter(Boolean);
      const lastName = lastNameParts.join(' ') || 'Administrador';
      const emailInUse = await tx.user.findFirst({ where: { email: request.adminEmail }, select: { id: true } });
      if (emailInUse) throw new ConflictException('No fue posible aprobar la solicitud con estos datos.');

      const tenant = await tx.tenant.create({ data: { name: request.companyName, slug, status: 'ACTIVE' } });
      const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: request.branchName, location: request.branchLocation } });
      await tx.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: SubscriptionStatus.TRIALING, startsAt: new Date(), trialEndsAt: this.trialEndsAt() },
      });

      const permissions = await tx.permission.findMany({ where: { NOT: { code: { startsWith: 'platform.' } } }, select: { id: true } });
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: 'TENANT_ADMIN',
          name: 'Administrador de empresa',
          description: 'Acceso administrativo dentro de la empresa registrada.',
          scope: AccessScope.TENANT,
          isSystem: true,
          rolePermissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          activeBranchId: branch.id,
          email: request.adminEmail,
          passwordHash: request.passwordHash,
          firstName: firstName || 'Administrador',
          lastName,
          userRoles: { create: { roleId: role.id } },
          branchAccesses: { create: { branchId: branch.id } },
        },
      });

      const approved = await tx.companyRegistrationRequest.update({
        where: { id: request.id },
        data: {
          status: CompanyRegistrationStatus.APPROVED,
          approvedTenantId: tenant.id,
          reviewedByUserId: reviewerUserId,
          reviewNotes: dto.reviewNotes?.trim() || null,
          reviewedAt: new Date(),
        },
      });

      return { ...this.serialize(approved), tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, admin: { id: user.id, email: user.email } };
    });
  }

  async reject(id: string, reviewerUserId: string, dto: ReviewCompanyRegistrationDto) {
    if (!dto.reviewNotes?.trim()) throw new BadRequestException('Indica una observación para rechazar la solicitud.');
    const item = await this.prisma.companyRegistrationRequest.updateMany({
      where: { id, status: CompanyRegistrationStatus.PENDING },
      data: { status: CompanyRegistrationStatus.REJECTED, reviewedByUserId: reviewerUserId, reviewNotes: dto.reviewNotes.trim(), reviewedAt: new Date() },
    });
    if (!item.count) throw new ConflictException('La solicitud no existe o ya fue revisada.');
    return this.getById(id);
  }

  private async getById(id: string) {
    const item = await this.prisma.companyRegistrationRequest.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Solicitud de empresa no encontrada.');
    return this.serialize(item);
  }

  private async nextSlug(tx: Prisma.TransactionClient, companyName: string) {
    const base = companyName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'empresa';
    let slug = base;
    let suffix = 2;
    while (await tx.tenant.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
    return slug;
  }

  private trialEndsAt() {
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + 14);
    return endsAt;
  }

  private serialize(item: { passwordHash: string; [key: string]: unknown }) {
    const { passwordHash: _passwordHash, ...safe } = item;
    return { ...safe, requestedAt: safe.createdAt };
  }
}
