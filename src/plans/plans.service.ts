import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    const { moduleIds = [], priceMonthly, priceYearly, ...rest } = dto;
    const plan = await this.prisma.plan.create({
      data: {
        ...rest,
        priceMonthly,
        priceYearly,
      },
    });
    await this.replaceModules(plan.id, moduleIds);
    return this.findOne(plan.id);
  }

  findAll() {
    return this.prisma.plan.findMany({
      include: {
        planModules: { include: { module: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.plan.findUnique({
      where: { id },
      include: {
        planModules: { include: { module: true } },
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    const { moduleIds, priceMonthly, priceYearly, ...rest } = dto;
    await this.prisma.plan.update({ where: { id }, data: rest });
    await this.prisma.plan.update({
      where: { id },
      data: {
        ...(priceMonthly !== undefined ? { priceMonthly } : {}),
        ...(priceYearly !== undefined ? { priceYearly } : {}),
      },
    });

    if (moduleIds) {
      await this.replaceModules(id, moduleIds);
    }

    return this.findOne(id);
  }

  remove(id: string, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    return this.prisma.plan.delete({ where: { id } });
  }

  private async replaceModules(planId: string, moduleIds: string[]) {
    await this.prisma.planModule.deleteMany({ where: { planId } });

    if (moduleIds.length > 0) {
      await this.prisma.planModule.createMany({
        data: moduleIds.map((moduleId) => ({ planId, moduleId })),
        skipDuplicates: true,
      });
    }
  }

  private assertSuperAdmin(actor: JwtPayload) {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmins can manage plans');
    }
  }
}
