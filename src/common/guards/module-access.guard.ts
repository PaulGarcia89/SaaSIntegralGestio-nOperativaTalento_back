import { ModuleCode } from '@prisma/client';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_MODULE_KEY } from '../constants/auth.constants';
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<ModuleCode>(ACCESS_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.isSuperAdmin) {
      return true;
    }

    const enabledModules = request.subscription?.modules ?? request.user?.enabledModules ?? [];

    if (!enabledModules.includes(requiredModule)) {
      throw new ForbiddenException(`Module ${requiredModule} is not enabled for this tenant plan`);
    }

    return true;
  }
}
