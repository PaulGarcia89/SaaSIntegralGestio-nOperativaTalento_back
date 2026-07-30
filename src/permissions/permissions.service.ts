import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: JwtPayload) {
    const codes = Array.from(new Set(actor.permissions)).sort((left, right) => left.localeCompare(right));

    if (codes.length === 0) {
      return [];
    }

    return this.prisma.permission.findMany({
      where: {
        code: {
          in: codes,
        },
      },
      orderBy: { code: 'asc' },
    });
  }
}
