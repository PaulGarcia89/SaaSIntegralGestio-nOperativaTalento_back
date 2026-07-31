import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

const PROTECTED_ROLE_CODES = new Set(['SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN']);
const PLATFORM_PERMISSION_PREFIXES = ['platform.'];

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async create(dto: CreateRoleDto, actor: JwtPayload, tenantId: string) {
    const targetTenantId = this.requireTenantContext(
      this.accessControl.resolveTenantId(actor, tenantId),
    );
    await this.assertPermissionsExist(dto.permissionIds ?? []);
    await this.assertRoleMutationAllowed(actor, targetTenantId, dto.code, dto.permissionIds ?? []);

    const role = await this.prisma.role.create({
      data: {
        tenantId: targetTenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        scope: actor.scope === 'branch' ? 'BRANCH' : 'TENANT',
      },
    });

    await this.replacePermissions(role.id, dto.permissionIds ?? []);
    return this.findOne(role.id, actor, targetTenantId);
  }

  findAll(actor: JwtPayload, tenantId: string) {
    return this.prisma.role.findMany({
      where: this.accessControl.buildTenantWhere(actor, tenantId),
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: JwtPayload, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id,
        ...this.accessControl.buildTenantWhere(actor, tenantId),
      },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actor: JwtPayload, tenantId: string) {
    const role = await this.findOne(id, actor, tenantId);
    if (role.isSystem && !actor.isSuperAdmin) {
      throw new ForbiddenException('System roles can only be edited by superadmins');
    }

    await this.assertRoleMutationAllowed(
      actor,
      role.tenantId,
      dto.code ?? role.code,
      dto.permissionIds ?? role.rolePermissions.map((entry) => entry.permissionId),
      role.code,
    );

    await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    if (dto.permissionIds) {
      await this.assertPermissionsExist(dto.permissionIds);
      await this.replacePermissions(id, dto.permissionIds);
    }

    return this.findOne(id, actor, tenantId);
  }

  async remove(id: string, actor: JwtPayload, tenantId: string) {
    const role = await this.findOne(id, actor, tenantId);
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    return this.prisma.role.delete({ where: { id } });
  }

  private async replacePermissions(roleId: string, permissionIds: string[]) {
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissionIds.length === 0) {
      return;
    }

    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
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
        'Tenant context is required for role management',
        ErrorCode.TENANT_CONTEXT_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    return tenantId;
  }

  private async assertRoleMutationAllowed(
    actor: JwtPayload,
    tenantId: string,
    nextRoleCode: string,
    permissionIds: string[],
    currentRoleCode?: string,
  ) {
    const normalizedRoleCode = nextRoleCode.trim().toUpperCase();

    if (
      (PROTECTED_ROLE_CODES.has(normalizedRoleCode) ||
        (currentRoleCode && PROTECTED_ROLE_CODES.has(currentRoleCode.toUpperCase()))) &&
      !actor.isSuperAdmin
    ) {
      throw new AppException(
        'Role is protected and cannot be managed by this actor',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    const permissions = permissionIds.length
      ? await this.prisma.permission.findMany({
          where: { id: { in: permissionIds } },
          select: { code: true },
        })
      : [];
    const includesPlatformPermission = permissions.some((permission) =>
      PLATFORM_PERMISSION_PREFIXES.some((prefix) => permission.code.startsWith(prefix)),
    );

    if (includesPlatformPermission && !actor.isSuperAdmin) {
      throw new AppException(
        'Platform permissions cannot be granted by this actor',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!actor.isSuperAdmin) {
      const actorPermissions = new Set(actor.permissions);
      const unownedPermission = permissions.find(
        (permission) => !actorPermissions.has(permission.code),
      );

      if (unownedPermission) {
        throw new AppException(
          `Actor cannot grant permission ${unownedPermission.code}`,
          ErrorCode.PERMISSION_DENIED,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    if (normalizedRoleCode === 'TENANT_ADMIN' && includesPlatformPermission) {
      throw new AppException(
        'Tenant admin cannot receive platform permissions',
        ErrorCode.PERMISSION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      normalizedRoleCode === 'PLATFORM_ADMIN' &&
      tenantId !== actor.tenantId
    ) {
      throw new AppException(
        'Platform admin roles must live in the platform tenant',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
