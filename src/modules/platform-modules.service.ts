import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePlatformModuleDto } from './dto/create-platform-module.dto';
import { UpdatePlatformModuleDto } from './dto/update-platform-module.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class PlatformModulesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePlatformModuleDto, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    return this.prisma.featureModule.create({ data: dto });
  }

  findAll() {
    return this.prisma.featureModule.findMany({
      include: {
        planModules: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.featureModule.findUnique({
      where: { id },
      include: {
        planModules: { include: { plan: true } },
      },
    });
  }

  update(id: string, dto: UpdatePlatformModuleDto, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    return this.prisma.featureModule.update({ where: { id }, data: dto });
  }

  remove(id: string, actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    return this.prisma.featureModule.delete({ where: { id } });
  }

  private assertSuperAdmin(actor: JwtPayload) {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmins can manage platform modules');
    }
  }
}
