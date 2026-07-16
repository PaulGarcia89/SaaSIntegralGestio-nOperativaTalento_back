import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async create(dto: CreateRoleDto, actor: JwtPayload, tenantId: string) {
    const targetTenantId = this.accessControl.resolveTenantId(actor, tenantId);
    await this.assertPermissionsExist(dto.permissionIds ?? []);

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
}
