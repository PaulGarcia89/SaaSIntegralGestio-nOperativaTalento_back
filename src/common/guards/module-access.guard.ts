import { ModuleCode } from '@prisma/client';
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_MODULE_KEY } from '../constants/auth.constants';
import { RequestWithUser } from '../types/request-with-user.type';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';

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
    if (request.user?.role === 'SUPERADMIN' && request.user.isGlobalContext) {
      return true;
    }

    const enabledModules = request.subscription?.modules ?? request.user?.enabledModules ?? [];

    if (!enabledModules.includes(requiredModule)) {
      throw new AppException(
        `Module ${requiredModule} is not enabled for this tenant plan`,
        ErrorCode.MODULE_NOT_ENABLED,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
