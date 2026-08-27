import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplicantTokenPayload } from './applicant-auth.service';

export type ApplicantRequest = Request & { applicant: ApplicantTokenPayload };

@Injectable()
export class ApplicantAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ApplicantRequest>();
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Applicant authentication is required');
    try {
      const payload = await this.jwt.verifyAsync<ApplicantTokenPayload>(token, { secret: this.config.get<string>('APPLICANT_JWT_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), audience: 'applicant' });
      const identity = await this.prisma.applicantIdentity.findFirst({ where: { id: payload.sub, email: payload.email, status: 'ACTIVE' }, select: { id: true } });
      if (!identity) throw new Error('Applicant is inactive');
      request.applicant = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Applicant token is invalid or expired');
    }
  }
}
