import { AccessScope } from '../enums/access-scope.enum';
import { RoleScope } from '../enums/role-scope.enum';

const PLATFORM_ADMIN_CODES = new Set(['SUPERADMIN', 'PLATFORM_ADMIN']);
const TENANT_ADMIN_CODES = new Set(['TENANT_ADMIN', 'ADMIN']);
// These business roles administer operational data for one or more explicitly
// assigned branches. Keeping the mapping here makes the authorization context
// consistent for guards, navigation and service-level filters.
const BRANCH_ADMIN_CODES = new Set(['BRANCH_ADMIN', 'HR_MANAGER', 'SUPERVISOR']);
const BRANCH_USER_CODES = new Set(['BRANCH_USER']);

export function deriveRoleScope(roleCodes: string[], isSuperAdmin: boolean): RoleScope {
  if (isSuperAdmin || roleCodes.some((roleCode) => PLATFORM_ADMIN_CODES.has(roleCode))) {
    return RoleScope.PLATFORM_ADMIN;
  }

  if (roleCodes.some((roleCode) => TENANT_ADMIN_CODES.has(roleCode))) {
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
  if (isSuperAdmin || roleScope === RoleScope.PLATFORM_ADMIN) {
    return AccessScope.GLOBAL;
  }

  if (roleScope === RoleScope.TENANT_ADMIN) {
    return AccessScope.TENANT;
  }

  return AccessScope.BRANCH;
}

export function derivePrimaryRole(roleCodes: string[], isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return 'SUPERADMIN';
  }

  if (roleCodes.includes('PLATFORM_ADMIN')) {
    return 'PLATFORM_ADMIN';
  }

  if (roleCodes.includes('TENANT_ADMIN') || roleCodes.includes('ADMIN')) {
    return 'TENANT_ADMIN';
  }

  return roleCodes[0] ?? null;
}
