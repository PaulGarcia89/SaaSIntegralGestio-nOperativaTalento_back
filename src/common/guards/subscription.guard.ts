import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RequestWithUser } from '../types/request-with-user.type';
import { ROUTE_SCOPE_KEY, ALLOWED_SUBSCRIPTION_STATES_KEY } from '../constants/auth.constants';
import { RouteScope } from '../enums/route-scope.enum';
import { AuthContextService } from '../auth/auth-context.service';
import { SubscriptionAccessState } from '../auth/subscription-access-state.enum';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authContextService: AuthContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const routeScope = this.reflector.getAllAndOverride<RouteScope | undefined>(ROUTE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowedStates =
      this.reflector.getAllAndOverride<SubscriptionAccessState[] | undefined>(
        ALLOWED_SUBSCRIPTION_STATES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [
        SubscriptionAccessState.ACTIVE,
        SubscriptionAccessState.TRIALING,
        SubscriptionAccessState.GRACE_PERIOD,
      ];

    if (routeScope === RouteScope.GLOBAL_ONLY) {
      return true;
    }

    const tenantId = request.tenant?.id ?? request.user?.activeTenantId ?? request.user?.tenantId;

    if (!tenantId) {
      throw new AppException(
        'Tenant context missing before subscription validation',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (request.user.role === 'SUPERADMIN' && request.user.isGlobalContext) {
      return true;
    }

    return this.attachSubscription(request, tenantId, allowedStates);
  }

  private async attachSubscription(
    request: RequestWithUser,
    tenantId: string,
    allowedStates: SubscriptionAccessState[],
  ): Promise<boolean> {
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
      throw new AppException(
        'Tenant has no subscription assigned',
        ErrorCode.SUBSCRIPTION_BLOCKED,
        HttpStatus.FORBIDDEN,
      );
    }

    const accessStatus = this.authContextService.resolveSubscriptionState(subscription);
    const tenantCapabilities = await this.authContextService.getTenantCapabilities(tenantId);

    if (!allowedStates.includes(accessStatus)) {
      throw new AppException(
        'Tenant subscription does not allow this operation',
        ErrorCode.SUBSCRIPTION_BLOCKED,
        HttpStatus.FORBIDDEN,
      );
    }

    request.subscription = {
      id: subscription.id,
      planId: subscription.planId,
      status: subscription.status,
      modules: tenantCapabilities.enabledModules,
      accessStatus,
      graceEndsAt:
        accessStatus === SubscriptionAccessState.GRACE_PERIOD
          ? subscription.endsAt?.toISOString() ?? null
          : null,
    };

    return true;
  }
}
