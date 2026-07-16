import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class AccessControlService {
  isGlobalActor(actor: JwtPayload) {
    return actor.isSuperAdmin || actor.scope === AccessScope.GLOBAL;
  }

  assertGlobalAccess(actor: JwtPayload, message = 'This action requires global SaaS governance access') {
    if (!this.isGlobalActor(actor)) {
      throw new ForbiddenException(message);
    }
  }

  resolveTenantId(actor: JwtPayload, requestedTenantId?: string | null) {
    if (this.isGlobalActor(actor)) {
      return requestedTenantId ?? actor.tenantId ?? null;
    }

    return actor.tenantId;
  }

  assertTenantAccess(actor: JwtPayload, targetTenantId: string, message = 'You do not have access to this tenant resource') {
    if (this.isGlobalActor(actor)) {
      return;
    }

    if (actor.tenantId !== targetTenantId) {
      throw new ForbiddenException(message);
    }
  }

  buildTenantWhere(actor: JwtPayload, requestedTenantId?: string | null) {
    const tenantId = this.resolveTenantId(actor, requestedTenantId);
    return tenantId ? { tenantId } : {};
  }
}
