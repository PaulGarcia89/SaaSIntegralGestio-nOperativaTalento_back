import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class AccessControlService {
  isGlobalActor(actor: JwtPayload) {
    return actor.scope === AccessScope.GLOBAL;
  }

  assertGlobalAccess(actor: JwtPayload, message = 'This action requires global SaaS governance access') {
    if (!this.isGlobalActor(actor)) {
      throw new ForbiddenException(message);
    }
  }

  resolveTenantId(actor: JwtPayload, requestedTenantId?: string | null) {
    if (actor.impersonation.active) {
      if (requestedTenantId && requestedTenantId !== actor.impersonation.tenantId) {
        throw new ForbiddenException('You do not have access to this tenant resource');
      }

      return actor.impersonation.tenantId;
    }

    if (actor.role === 'SUPERADMIN') {
      // A global super administrator may use a tenant as the technical context
      // required by module/subscription guards without becoming that tenant's
      // user. Domain services remain responsible for applying their global or
      // tenant-specific data scope, and impersonation is still required when an
      // action must be audited as operating on behalf of a tenant user.
      return requestedTenantId ?? null;
    }

    if (actor.role === 'PLATFORM_ADMIN') {
      if (!actor.activeTenantId) {
        return null;
      }

      if (requestedTenantId && requestedTenantId !== actor.activeTenantId) {
        throw new ForbiddenException('You do not have access to this tenant resource');
      }

      return actor.activeTenantId;
    }

    if (requestedTenantId && requestedTenantId !== actor.activeTenantId) {
      throw new ForbiddenException('You do not have access to this tenant resource');
    }

    return actor.activeTenantId;
  }

  assertTenantAccess(actor: JwtPayload, targetTenantId: string, message = 'You do not have access to this tenant resource') {
    if (actor.impersonation.active && actor.impersonation.tenantId === targetTenantId) {
      return;
    }

    if (actor.role === 'SUPERADMIN' && !actor.impersonation.active) {
      return;
    }

    if (!actor.allowedTenantIds.includes(targetTenantId)) {
      throw new ForbiddenException(message);
    }
  }

  buildTenantWhere(actor: JwtPayload, requestedTenantId?: string | null) {
    const tenantId = this.resolveTenantId(actor, requestedTenantId);
    return tenantId ? { tenantId } : {};
  }
}
