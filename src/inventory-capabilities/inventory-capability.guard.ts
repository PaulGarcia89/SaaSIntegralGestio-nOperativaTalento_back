import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithUser } from '../common/types/request-with-user.type';
import { INVENTORY_CAPABILITY_KEY } from './inventory-capability.decorator';
import { InventoryCapabilitiesService } from './inventory-capabilities.service';
import { InventoryCapabilityCode } from '@prisma/client';

@Injectable()
export class InventoryCapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: InventoryCapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const code = this.reflector.getAllAndOverride<InventoryCapabilityCode | undefined>(
      INVENTORY_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!code) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role === 'SUPERADMIN' && request.user.isGlobalContext) return true;

    await this.capabilities.assertEnabled(request.tenant!.id, code);
    return true;
  }
}
