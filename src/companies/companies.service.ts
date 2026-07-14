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

  async getCurrentCompany(actor: JwtPayload) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
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

  getCurrentCapabilities(actor: JwtPayload) {
    return this.platformAccessService.getTenantCapabilities(actor.tenantId);
  }

  async updateCurrentCompany(actor: JwtPayload, dto: UpdateCompanyDto) {
    if (!actor.isSuperAdmin && !actor.permissions.includes('tenants.update')) {
      throw new ForbiddenException('You do not have permission to update the company profile');
    }

    return this.prisma.tenant.update({
      where: { id: actor.tenantId },
      data: dto,
    });
  }
}
