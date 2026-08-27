import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareerPortalAccess } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplicantTokenPayload } from '../applications/applicant-auth.service';
import { createHash } from 'node:crypto';

@Injectable()
export class CareerPortalAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const slug = request.params.slug as string | undefined;
    const portal = await this.prisma.careerPortal.findFirst({ where: { isActive: true, ...(slug ? { OR: [{ slug }, { tenant: { slug } }] } : {}) }, select: { id: true, access: true, tenantId: true } });
    if (!portal) throw new NotFoundException('Career portal not found');
    if (portal.access === CareerPortalAccess.PUBLIC) return true;
    const applicant = await this.authenticate(request);
    const companyAccess = portal.tenantId ? await this.prisma.companyApplicant.findFirst({ where: { tenantId: portal.tenantId, identityId: applicant.sub }, select: { id: true } }) : null;
    if (companyAccess) return true;
    const invitationToken = this.readInvitationToken(request);
    if (!invitationToken) throw new ForbiddenException('A valid portal invitation is required');
    const invitation = await this.prisma.applicantInvitation.findFirst({
      where: { portalId: portal.id, tokenHash: this.hash(invitationToken), acceptedAt: null, expiresAt: { gt: new Date() }, email: applicant.email },
      select: { id: true },
    });
    if (!invitation) throw new ForbiddenException('Portal invitation is invalid or expired');
    request.portalInvitationId = invitation.id;
    return true;
  }

  private async authenticate(request: any): Promise<ApplicantTokenPayload> {
    const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Applicant authentication is required');
    try {
      const payload = await this.jwt.verifyAsync<ApplicantTokenPayload>(token, { secret: this.config.get<string>('APPLICANT_JWT_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), audience: 'applicant' });
      const identity = await this.prisma.applicantIdentity.findFirst({ where: { id: payload.sub, email: payload.email, status: 'ACTIVE' }, select: { id: true } });
      if (!identity) throw new Error('Applicant is inactive');
      request.applicant = payload;
      return payload;
    } catch {
      throw new UnauthorizedException('Applicant token is invalid or expired');
    }
  }

  private readInvitationToken(request: any) {
    const header = request.headers['x-invitation-token'];
    return typeof header === 'string' ? header : typeof request.query?.invitationToken === 'string' ? request.query.invitationToken : undefined;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
