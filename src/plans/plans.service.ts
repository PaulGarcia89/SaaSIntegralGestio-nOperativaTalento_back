import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async create(dto: CreatePlanDto, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage plans');
    const { moduleIds = [], priceMonthly, priceYearly, limits, ...rest } = dto;
    const plan = await this.prisma.plan.create({
      data: {
        ...rest,
        priceMonthly,
        priceYearly,
        limits: limits as Prisma.InputJsonValue | undefined,
      },
    });
    await this.replaceModules(plan.id, moduleIds);
    return this.findOne(plan.id);
  }

  findAll() {
    return this.prisma.plan.findMany({
      include: {
        planModules: { include: { module: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.plan.findUnique({
      where: { id },
      include: {
        planModules: { include: { module: true } },
        _count: { select: { subscriptions: true } },
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage plans');
    const { moduleIds, priceMonthly, priceYearly, limits, ...rest } = dto;
    await this.prisma.plan.update({
      where: { id },
      data: {
        ...rest,
        ...(limits !== undefined ? { limits: limits as Prisma.InputJsonValue } : {}),
      },
    });
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

  async remove(id: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage plans');
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      select: { id: true, _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan._count.subscriptions > 0) {
      throw new ConflictException('No se puede eliminar un plan con suscripciones asociadas');
    }
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
}
