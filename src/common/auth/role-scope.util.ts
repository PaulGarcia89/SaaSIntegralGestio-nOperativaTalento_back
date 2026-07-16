import { AccessScope } from '../enums/access-scope.enum';
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

export function deriveAccessScope(roleScope: RoleScope, isSuperAdmin: boolean): AccessScope {
  if (isSuperAdmin) {
    return AccessScope.GLOBAL;
  }

  if (roleScope === RoleScope.TENANT_ADMIN) {
    return AccessScope.TENANT;
  }

  return AccessScope.BRANCH;
}

export function derivePrimaryRole(roleCodes: string[], isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return 'admin_saas';
  }

  if (roleCodes.includes('TENANT_ADMIN') || roleCodes.includes('ADMIN')) {
    return 'admin_empresa';
  }

  return roleCodes[0] ?? null;
}
