import { ModuleCode } from '@prisma/client';
import { AccessScope } from '../enums/access-scope.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { SubscriptionAccessState } from '../auth/subscription-access-state.enum';

export interface JwtPayload {
  sub: string;
  userId: string;
  sessionId?: string;
  tenantId: string;
  allowedTenantIds: string[];
  activeTenantId: string | null;
  tenantSlug: string;
  tenantName: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string | null;
  scope: AccessScope;
  isSuperAdmin: boolean;
  roleScope: RoleScope;
  allowedBranchIds: string[];
  activeBranchId: string | null;
  roles: string[];
  permissions: string[];
  enabledModules: ModuleCode[];
  isGlobalContext: boolean;
  impersonation: {
    active: boolean;
    tenantId: string | null;
    startedAt: string | null;
    reason: string | null;
  };
  subscriptionStatus: SubscriptionAccessState;
  subscriptionGraceEndsAt: string | null;
}
