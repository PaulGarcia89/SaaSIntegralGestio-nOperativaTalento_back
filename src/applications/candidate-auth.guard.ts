import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { CandidateTokenPayload } from './candidate-auth.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type CandidateRequest = Request & { candidate: CandidateTokenPayload };
const CANDIDATE_SESSION_COOKIE = 'candidate_session';

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
    const cookieToken = request.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${CANDIDATE_SESSION_COOKIE}=`))
      ?.slice(CANDIDATE_SESSION_COOKIE.length + 1);
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : cookieToken;
    if (!token) {
      throw new UnauthorizedException('Candidate authentication is required');
    }
    try {
      request.candidate = await this.jwt.verifyAsync<CandidateTokenPayload>(token, {
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
    } catch (legacyError) {
      try {
        const applicant = await this.jwt.verifyAsync<{ sub: string; email: string; audience: 'applicant'; portalId: string; sid: string }>(token, {
          secret: this.config.get<string>('APPLICANT_JWT_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          audience: 'applicant',
        });
        const identity = await this.prisma.applicantIdentity.findFirst({ where: { id: applicant.sub, email: applicant.email, status: 'ACTIVE' }, select: { legacyAccountId: true } });
        if (!identity?.legacyAccountId) throw new Error('Applicant has no legacy account');
        const account = await this.prisma.candidateAccount.findFirst({ where: { id: identity.legacyAccountId, email: applicant.email, isActive: true }, select: { id: true } });
        if (!account) throw new Error('Candidate account is inactive');
        request.candidate = { sub: account.id, email: applicant.email, audience: 'candidate' };
        return true;
      } catch {
        throw legacyError instanceof UnauthorizedException ? legacyError : new UnauthorizedException('Candidate token is invalid or expired');
      }
    }
  }
}
