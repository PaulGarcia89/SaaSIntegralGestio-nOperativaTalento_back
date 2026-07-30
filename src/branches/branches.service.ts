import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: {
        tenantId,
        name: dto.name,
        location: dto.location,
      },
    });
  }

  async findAll(tenantId: string, actor: JwtPayload, query: ListBranchesDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.BranchWhereInput = {
      tenantId,
      ...this.branchScope(actor),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findOne(id: string, tenantId: string, actor?: JwtPayload) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id,
        tenantId,
        ...(actor ? this.branchScope(actor) : {}),
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async update(id: string, tenantId: string, dto: UpdateBranchDto) {
    await this.findOne(id, tenantId);

    return this.prisma.branch.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.branch.delete({ where: { id } });
  }

  private branchScope(actor: JwtPayload): Prisma.BranchWhereInput {
    if (actor.scope !== AccessScope.BRANCH || actor.isSuperAdmin) {
      return {};
    }

    // An empty assignment must never degrade into tenant-wide access.
    return { id: { in: actor.allowedBranchIds } };
  }
}
