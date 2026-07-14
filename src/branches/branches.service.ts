import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ListBranchesDto } from './dto/list-branches.dto';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';

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

  async findAll(tenantId: string, query: ListBranchesDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.BranchWhereInput = {
      tenantId,
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

  async findOne(id: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }
}
