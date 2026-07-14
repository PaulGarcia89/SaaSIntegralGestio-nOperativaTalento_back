import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from '../types/request-with-user.type';
import { PlatformAccessService } from '../../platform/platform-access.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.tenant?.id ?? request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing before subscription validation');
    }

    if (request.user.isSuperAdmin) {
      return true;
    }

    return this.attachSubscription(request, tenantId);
  }

  private async attachSubscription(request: RequestWithUser, tenantId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            planModules: {
              include: {
                module: true,
              },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new ForbiddenException('Tenant has no subscription assigned');
    }

    const now = new Date();
    const statusAllowed =
      subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALING;
    const dateAllowed = !subscription.endsAt || subscription.endsAt >= now;

    if (!statusAllowed || !dateAllowed) {
      throw new ForbiddenException('Tenant subscription is not active');
    }

    const tenantCapabilities = await this.platformAccessService.getTenantCapabilities(tenantId);

    request.subscription = {
      id: subscription.id,
      planId: subscription.planId,
      status: subscription.status,
      modules: tenantCapabilities.enabledModules,
    };

    return true;
  }
}
