import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { CandidateLoginDto, CandidateRegisterDto } from './dto/candidate-auth.dto';

export interface CandidateTokenPayload {
  sub: string;
  email: string;
  audience: 'candidate';
}

@Injectable()
export class CandidateAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: CandidateRegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.candidateAccount.findUnique({ where: { email } })) {
      throw new ConflictException('Candidate account already exists');
    }
    const account = await this.prisma.candidateAccount.create({
      data: { email, passwordHash: await bcrypt.hash(dto.password, 12) },
    });
    return this.issueToken(account.id, account.email);
  }

  async login(dto: CandidateLoginDto) {
    const email = dto.email.trim().toLowerCase();
    const account = await this.prisma.candidateAccount.findUnique({ where: { email } });
    if (!account || !account.isActive || !(await bcrypt.compare(dto.password, account.passwordHash))) {
      throw new UnauthorizedException('Invalid candidate credentials');
    }
    return this.issueToken(account.id, account.email);
  }

  private async issueToken(accountId: string, email: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: accountId, email, audience: 'candidate' } satisfies CandidateTokenPayload,
      {
        secret:
          this.config.get<string>('CANDIDATE_JWT_SECRET') ??
          this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '1h',
        audience: 'candidate',
      },
    );
    return { accessToken, expiresIn: 3600, candidate: { id: accountId, email } };
  }
}
