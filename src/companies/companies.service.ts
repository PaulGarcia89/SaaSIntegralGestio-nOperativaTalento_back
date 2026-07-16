import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PlatformAccessService } from '../platform/platform-access.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async getCurrentCompany(actor: JwtPayload, tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: actor.isSuperAdmin ? tenantId : actor.tenantId },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
          },
        },
      },
    });

    return {
      ...tenant,
      userCount: tenant._count.users,
      branchCount: tenant._count.branches,
    };
  }

  getCurrentCapabilities(actor: JwtPayload, tenantId: string) {
    return this.platformAccessService.getTenantCapabilities(actor.isSuperAdmin ? tenantId : actor.tenantId);
  }

  async updateCurrentCompany(actor: JwtPayload, tenantId: string, dto: UpdateCompanyDto) {
    if (!actor.isSuperAdmin && !actor.permissions.includes('tenants.update')) {
      throw new ForbiddenException('You do not have permission to update the company profile');
    }

    return this.prisma.tenant.update({
      where: { id: actor.isSuperAdmin ? tenantId : actor.tenantId },
      data: dto,
    });
  }
}
