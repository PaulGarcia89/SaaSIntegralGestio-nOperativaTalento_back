import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccessControlService } from '../access-control/access-control.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { deriveRoleScope } from '../common/auth/role-scope.util';
import { RoleScope } from '../common/enums/role-scope.enum';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';

const PROTECTED_ROLE_CODES = new Set(['SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN']);
const PLATFORM_PERMISSION_CODES = new Set([
  'platform.tenant.switch',
  'platform.tenant.impersonate',
]);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async create(dto: CreateUserDto, actor: JwtPayload, tenantId: string) {
    const {
      password,
      roleIds = [],
      permissionIds = [],
      allowedBranchIds = [],
      activeBranchId,
      ...rest
    } = dto;
    const effectiveTenantId = this.requireTenantContext(
      this.accessControl.resolveTenantId(actor, dto.tenantId ?? tenantId),
    );
    await this.planLimits.assertCapacity(effectiveTenantId, 'maxUsers');
    const passwordHash = await bcrypt.hash(password, 10);

    const roles = await this.assertRoleOwnership(roleIds, effectiveTenantId);
    await this.assertPermissionsExist(permissionIds);
    await this.assertAssignmentAllowed(actor, effectiveTenantId, roles, permissionIds);
    await this.validateBranchScope({
      tenantId: effectiveTenantId,
      roleCodes: roles.map((role) => role.code),
      allowedBranchIds,
      activeBranchId,
    });

    const user = await this.prisma.user.create({
      data: {
        ...rest,
        tenantId: effectiveTenantId,
        passwordHash,
        activeBranchId: activeBranchId ?? null,
      },
    });

    await this.replaceRelations(user.id, roleIds, permissionIds);
    await this.replaceBranchAccesses(user.id, allowedBranchIds);
    return this.findOne(user.id, actor, effectiveTenantId);
  }

  findAll(actor: JwtPayload, tenantId: string) {
    return this.prisma.user
      .findMany({
        where: this.accessControl.buildTenantWhere(actor, tenantId),
        include: {
          tenant: true,
          activeBranch: true,
          branchAccesses: { include: { branch: true } },
          userRoles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      .then((users) => users.map((user) => this.sanitizeUser(user)));
  }

  findAllGlobal(actor: JwtPayload) {
    if (!this.accessControl.isGlobalActor(actor)) {
      throw new AppException(
        'Global user governance access is required',
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
      );
    }

    return this.prisma.user
      .findMany({
        where: actor.isSuperAdmin
          ? undefined
          : { tenantId: { in: actor.allowedTenantIds } },
        include: {
          tenant: true,
          activeBranch: true,
          branchAccesses: { include: { branch: true } },
          userRoles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
        orderBy: [{ tenant: { name: 'asc' } }, { createdAt: 'desc' }],
      })
      .then((users) => users.map((user) => this.sanitizeUser(user)));
  }

  async findOne(id: string, actor: JwtPayload, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        ...this.accessControl.buildTenantWhere(actor, tenantId),
      },
      include: {
        tenant: true,
        activeBranch: true,
        branchAccesses: { include: { branch: true } },
        userRoles: { include: { role: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: JwtPayload, tenantId: string) {
    const existingUser = await this.findOne(id, actor, tenantId);
    const {
      password,
      roleIds,
      permissionIds,
      allowedBranchIds,
      activeBranchId,
      tenantId: nextTenantId,
      ...rest
    } = dto;
    const data: Record<string, unknown> = { ...rest };
    const effectiveTenantId = this.requireTenantContext(
      this.accessControl.resolveTenantId(
        actor,
        nextTenantId ?? existingUser.tenantId,
      ),
    );

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (this.accessControl.isGlobalActor(actor) && nextTenantId) {
      data.tenantId = nextTenantId;
    }

    const nextRoles = roleIds
      ? await this.assertRoleOwnership(roleIds, effectiveTenantId)
      : existingUser.userRoles.map((entry) => entry.role);

    if (permissionIds) {
      await this.assertPermissionsExist(permissionIds);
    }

    const nextAllowedBranchIds =
      allowedBranchIds ?? (existingUser.branchAccesses ?? []).map((branchAccess) => branchAccess.branchId);
    const nextActiveBranchId =
      activeBranchId !== undefined ? activeBranchId : existingUser.activeBranchId;

    await this.assertAssignmentAllowed(actor, effectiveTenantId, nextRoles, permissionIds ?? []);

    await this.validateBranchScope({
      tenantId: effectiveTenantId,
      roleCodes: nextRoles.map((role) => role.code),
      allowedBranchIds: nextAllowedBranchIds,
      activeBranchId: nextActiveBranchId,
    });

    await this.prisma.user.update({ where: { id }, data });

    if (roleIds || permissionIds) {
      await this.replaceRelations(id, roleIds ?? [], permissionIds ?? []);
    }

    if (allowedBranchIds || activeBranchId !== undefined) {
      await this.prisma.user.update({
        where: { id },
        data: {
          activeBranchId: nextActiveBranchId ?? null,
        },
      });
    }

    if (allowedBranchIds) {
      await this.replaceBranchAccesses(id, allowedBranchIds);
    }

    return this.findOne(id, actor, effectiveTenantId);
  }

  async remove(id: string, actor: JwtPayload, tenantId: string) {
    const user = await this.findOne(id, actor, tenantId);
    if (user.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmins can remove the superadmin account');
    }

    return this.prisma.user
      .delete({
        where: { id },
        include: {
          tenant: true,
          activeBranch: true,
          branchAccesses: { include: { branch: true } },
          userRoles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
      })
      .then((user) => this.sanitizeUser(user));
  }

  private sanitizeUser<
    T extends {
      passwordHash?: string | null;
      refreshTokenHash?: string | null;
      branchAccesses?: Array<{ branchId: string }>;
    },
  >(user: T) {
    const { passwordHash, refreshTokenHash, branchAccesses, ...safeUser } = user;

    return {
      ...safeUser,
      branchAccesses,
      allowedBranchIds: branchAccesses?.map((branchAccess) => branchAccess.branchId) ?? [],
    };
  }

  private async replaceRelations(userId: string, roleIds: string[], permissionIds: string[]) {
    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userPermission.deleteMany({ where: { userId } });

    if (roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      });
    }

    if (permissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({ userId, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  private async replaceBranchAccesses(userId: string, branchIds: string[]) {
    await this.prisma.userBranchAccess.deleteMany({ where: { userId } });

    if (branchIds.length === 0) {
      return;
    }

    await this.prisma.userBranchAccess.createMany({
      data: branchIds.map((branchId) => ({ userId, branchId })),
      skipDuplicates: true,
    });
  }

  private async assertRoleOwnership(roleIds: string[], tenantId: string) {
    if (roleIds.length === 0) {
      return [];
    }

    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        tenantId,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (roles.length !== roleIds.length) {
      throw new ForbiddenException('One or more roles do not belong to the current tenant');
    }

    return roles;
  }

  private async assertPermissionsExist(permissionIds: string[]) {
    if (permissionIds.length === 0) {
      return;
    }

    const count = await this.prisma.permission.count({
      where: { id: { in: permissionIds } },
    });

    if (count !== permissionIds.length) {
      throw new NotFoundException('One or more permissions do not exist');
    }
  }

  private requireTenantContext(tenantId: string | null) {
    if (!tenantId) {
      throw new AppException(
        'Tenant context is required for user management',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    return tenantId;
  }

  private async assertAssignmentAllowed(
    actor: JwtPayload,
    tenantId: string,
    roles: Array<{ id: string; code: string }>,
    permissionIds: string[],
  ) {
    const normalizedRoleCodes = roles.map((role) => role.code.trim().toUpperCase());
    const protectedRoleRequested = normalizedRoleCodes.some((roleCode) =>
      PROTECTED_ROLE_CODES.has(roleCode),
    );

    if (protectedRoleRequested && !actor.isSuperAdmin) {
      throw new AppException(
        'This actor cannot assign protected roles',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (normalizedRoleCodes.includes('PLATFORM_ADMIN') && tenantId !== actor.tenantId) {
      throw new AppException(
        'Platform administrators must belong to the platform tenant',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (permissionIds.length === 0) {
      return;
    }

    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { code: true },
    });
    const includesPlatformPermission = permissions.some((permission) =>
      PLATFORM_PERMISSION_CODES.has(permission.code),
    );

    if (includesPlatformPermission && !actor.isSuperAdmin) {
      throw new AppException(
        'This actor cannot grant platform permissions',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (normalizedRoleCodes.includes('TENANT_ADMIN') && includesPlatformPermission) {
      throw new AppException(
        'Tenant admins cannot receive platform permissions',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async validateBranchScope(input: {
    tenantId: string;
    roleCodes: string[];
    allowedBranchIds: string[];
    activeBranchId?: string | null;
  }) {
    const roleScope = deriveRoleScope(input.roleCodes, false);

    if (input.allowedBranchIds.length > 0) {
      const count = await this.prisma.branch.count({
        where: {
          id: { in: input.allowedBranchIds },
          tenantId: input.tenantId,
        },
      });

      if (count !== input.allowedBranchIds.length) {
        throw new ForbiddenException('One or more branches do not belong to the current tenant');
      }
    }

    if (input.activeBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: input.activeBranchId,
          tenantId: input.tenantId,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new ForbiddenException('Active branch does not belong to the current tenant');
      }
    }

    if (roleScope === RoleScope.TENANT_ADMIN) {
      return;
    }

    if (input.allowedBranchIds.length === 0) {
      throw new ForbiddenException('Branch-scoped users must have at least one allowed branch');
    }

    if (!input.activeBranchId) {
      throw new ForbiddenException('Branch-scoped users must have an active branch');
    }

    if (!input.allowedBranchIds.includes(input.activeBranchId)) {
      throw new ForbiddenException('Active branch must be included in the allowed branches');
    }
  }
}
