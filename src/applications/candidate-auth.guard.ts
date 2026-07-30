import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { CandidateTokenPayload } from './candidate-auth.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type CandidateRequest = Request & { candidate: CandidateTokenPayload };

@Injectable()
export class CandidateAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CandidateRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Candidate authentication is required');
    }
    try {
      request.candidate = await this.jwt.verifyAsync<CandidateTokenPayload>(authorization.slice(7), {
        secret:
          this.config.get<string>('CANDIDATE_JWT_SECRET') ??
          this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: 'candidate',
      });
      if (request.candidate.audience !== 'candidate') throw new Error('Invalid audience');
      const account = await this.prisma.candidateAccount.findFirst({
        where: {
          id: request.candidate.sub,
          email: request.candidate.email,
          isActive: true,
        },
        select: { id: true },
      });
      if (!account) throw new Error('Candidate account is inactive');
      return true;
    } catch {
      throw new UnauthorizedException('Candidate token is invalid or expired');
    }
  }
}
