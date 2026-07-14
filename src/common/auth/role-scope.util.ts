import { RoleScope } from '../enums/role-scope.enum';

const TENANT_ADMIN_CODES = new Set(['TENANT_ADMIN', 'SUPERADMIN', 'ADMIN']);
const BRANCH_ADMIN_CODES = new Set(['BRANCH_ADMIN']);
const BRANCH_USER_CODES = new Set(['BRANCH_USER']);

export function deriveRoleScope(roleCodes: string[], isSuperAdmin: boolean): RoleScope {
  if (isSuperAdmin || roleCodes.some((roleCode) => TENANT_ADMIN_CODES.has(roleCode))) {
    return RoleScope.TENANT_ADMIN;
  }

  if (roleCodes.some((roleCode) => BRANCH_ADMIN_CODES.has(roleCode))) {
    return RoleScope.BRANCH_ADMIN;
  }

  if (roleCodes.some((roleCode) => BRANCH_USER_CODES.has(roleCode))) {
    return RoleScope.BRANCH_USER;
  }

  return RoleScope.BRANCH_USER;
}
