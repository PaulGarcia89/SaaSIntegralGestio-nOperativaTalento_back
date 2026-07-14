import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTenantDto, actor: JwtPayload) {
    this.assertSuperAdmin(actor, 'Only superadmins can create tenants');
    return this.prisma.tenant.create({ data: dto });
  }

  findAll(actor: JwtPayload) {
    if (!actor.isSuperAdmin) {
      return this.prisma.tenant
        .findMany({
          where: { id: actor.tenantId },
          include: {
            subscription: {
              include: { plan: true },
            },
            _count: {
              select: { branches: true },
            },
          },
        })
        .then((tenants) => tenants.map((tenant) => this.mapTenantSummary(tenant)));
    }

    return this.prisma.tenant
      .findMany({
        include: {
          subscription: {
            include: { plan: true },
          },
          _count: {
            select: { branches: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      .then((tenants) => tenants.map((tenant) => this.mapTenantSummary(tenant)));
  }

  async findOne(id: string, actor: JwtPayload) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: {
          include: { plan: true },
        },
        users: true,
        _count: {
          select: { branches: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!actor.isSuperAdmin && tenant.id !== actor.tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    return this.mapTenantSummary(tenant);
  }

  async update(id: string, dto: UpdateTenantDto, actor: JwtPayload) {
    await this.ensureTenantAccess(id, actor);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: string, actor: JwtPayload) {
    this.assertSuperAdmin(actor, 'Only superadmins can delete tenants');
    return this.prisma.tenant.delete({ where: { id } });
  }

  private async ensureTenantAccess(tenantId: string, actor: JwtPayload) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant');
    }
  }

  private assertSuperAdmin(actor: JwtPayload, message: string) {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException(message);
    }
  }

  private mapTenantSummary<
    T extends {
      _count?: {
        branches?: number;
      };
    },
  >(tenant: T) {
    const { _count, ...rest } = tenant;

    return {
      ...rest,
      branchCount: _count?.branches ?? 0,
    };
  }
}
