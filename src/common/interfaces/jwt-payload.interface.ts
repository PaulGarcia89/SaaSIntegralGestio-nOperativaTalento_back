import { ModuleCode } from '@prisma/client';
import { RoleScope } from '../enums/role-scope.enum';

export interface JwtPayload {
  sub: string;
  userId: string;
  sessionId?: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  roleScope: RoleScope;
  allowedBranchIds: string[];
  activeBranchId: string | null;
  roles: string[];
  permissions: string[];
  enabledModules: ModuleCode[];
}
