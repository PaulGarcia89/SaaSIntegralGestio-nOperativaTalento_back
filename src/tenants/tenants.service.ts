import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PlatformAccessService } from '../platform/platform-access.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
    private readonly accessControl: AccessControlService,
  ) {}

  create(dto: CreateTenantDto, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can create tenants');
    return this.prisma.tenant.create({ data: dto });
  }

  async findAll(actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can list tenants');
    const tenants = await this.prisma.tenant.findMany({
      include: {
        subscription: {
          include: { plan: true },
        },
        _count: {
          select: { branches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(tenants.map((tenant) => this.mapTenantSummary(tenant)));
  }

  async findOne(id: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can view tenant registry entries');
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

    return this.mapTenantSummary(tenant);
  }

  async update(id: string, dto: UpdateTenantDto, actor: JwtPayload) {
    await this.ensureTenantAccess(id, actor);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can delete tenants');
    return this.prisma.tenant.delete({ where: { id } });
  }

  private async ensureTenantAccess(tenantId: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage tenant registry entries');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
  }

  private async mapTenantSummary<
    T extends {
      id: string;
      _count?: {
        branches?: number;
      };
    },
  >(tenant: T) {
    const { _count, ...rest } = tenant;
    const capabilities = await this.platformAccessService.getTenantCapabilities(tenant.id);

    return {
      ...rest,
      branchCount: _count?.branches ?? 0,
      planCode: capabilities.plan?.code ?? null,
      enabledModules: capabilities.enabledModules,
      capabilities,
    };
  }
}
