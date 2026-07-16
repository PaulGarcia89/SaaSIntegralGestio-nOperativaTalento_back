import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  create(dto: CreateSubscriptionDto, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage subscriptions');
    return this.prisma.subscription.create({
      data: {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
      },
      include: { tenant: true, plan: true },
    });
  }

  findAll(actor: JwtPayload, tenantId?: string) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can list subscriptions');
    return this.prisma.subscription.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { tenant: true, plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can view subscriptions');
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { tenant: true, plan: { include: { planModules: { include: { module: true } } } } },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }

  update(id: string, dto: UpdateSubscriptionDto, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage subscriptions');
    return this.prisma.subscription.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
      },
      include: { tenant: true, plan: true },
    });
  }

  remove(id: string, actor: JwtPayload) {
    this.accessControl.assertGlobalAccess(actor, 'Only superadmins can manage subscriptions');
    return this.prisma.subscription.delete({ where: { id } });
  }
}
