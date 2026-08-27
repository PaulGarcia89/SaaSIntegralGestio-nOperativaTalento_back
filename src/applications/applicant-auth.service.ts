import { Injectable, UnauthorizedException, NotFoundException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CareerPortalAccess, CareerPortalType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplicantLoginDto, ApplicantRegisterDto } from './dto/applicant-auth.dto';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

export interface ApplicantTokenPayload {
  sub: string;
  email: string;
  audience: 'applicant';
  portalId: string;
  sid: string;
}

@Injectable()
export class ApplicantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: ApplicantRegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const portal = await this.resolvePortal(dto.portalSlug, dto.invitationToken);
    const [identity, legacy] = await Promise.all([
      this.prisma.applicantIdentity.findUnique({ where: { email } }),
      this.prisma.candidateAccount.findUnique({ where: { email }, include: { candidates: true } }),
    ]);
    if (identity || legacy) {
      throw new AppException(
        'Applicant account already exists',
        ErrorCode.APPLICANT_ACCOUNT_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.$transaction(async (tx) => {
      const account = await tx.candidateAccount.create({ data: { email, passwordHash } });
      const newIdentity = await tx.applicantIdentity.create({
        data: { email, passwordHash, legacyAccountId: account.id, preferredLocale: 'es', profile: { create: {} } },
      });
      return newIdentity;
    });
    return this.issueSession(created.id, email, portal.id);
  }

  async login(dto: ApplicantLoginDto) {
    const email = this.normalizeEmail(dto.email);
    const portal = await this.resolvePortal(dto.portalSlug, dto.invitationToken);
    let identity = await this.prisma.applicantIdentity.findUnique({ where: { email } });
    if (identity) {
      const legacy = identity.legacyAccountId
        ? await this.prisma.candidateAccount.findUnique({ where: { id: identity.legacyAccountId }, select: { isActive: true } })
        : null;
      if (legacy && !legacy.isActive) {
        throw new UnauthorizedException('Invalid applicant credentials');
      }
      if (!identity.passwordHash || !(await bcrypt.compare(dto.password, identity.passwordHash))) {
        throw new UnauthorizedException('Invalid applicant credentials');
      }
    } else {
      const legacy = await this.prisma.candidateAccount.findUnique({ where: { email }, include: { candidates: true } });
      if (!legacy || !legacy.isActive || !(await bcrypt.compare(dto.password, legacy.passwordHash))) {
        throw new UnauthorizedException('Invalid applicant credentials');
      }
      identity = await this.migrateLegacyAccount(legacy.id, legacy.email, legacy.passwordHash, legacy);
    }
    return this.issueSession(identity.id, identity.email, portal.id);
  }

  async refresh(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) throw new UnauthorizedException('Applicant refresh token is required');
    const session = await this.prisma.portalApplicantSession.findUnique({
      where: { refreshTokenHash: this.hash(rawRefreshToken) },
      include: { identity: true },
    });
    if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) {
      if (session?.status === 'REVOKED') {
        await this.prisma.portalApplicantSession.updateMany({
          where: { identityId: session.identityId, portalId: session.portalId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Applicant refresh token is invalid or expired');
    }
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.portalApplicantSession.update({ where: { id: session.id }, data: { status: 'REVOKED', revokedAt: new Date(), lastUsedAt: new Date() } });
      const raw = randomBytes(48).toString('base64url');
      const replacement = await tx.portalApplicantSession.create({
        data: { identityId: session.identityId, portalId: session.portalId, refreshTokenHash: this.hash(raw), expiresAt: this.refreshExpiry() },
      });
      return { raw, session: replacement };
    });
    return this.issueAccess(session.identity.id, session.identity.email, session.portalId, next.session.id, next.raw);
  }

  async logout(rawRefreshToken: string | undefined) {
    if (rawRefreshToken) {
      await this.prisma.portalApplicantSession.updateMany({
        where: { refreshTokenHash: this.hash(rawRefreshToken), status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
    }
    return { loggedOut: true };
  }

  async me(identityId: string) {
    const identity = await this.prisma.applicantIdentity.findUnique({
      where: { id: identityId },
      include: { profile: true, companyApplicants: { select: { tenantId: true } } },
    });
    if (!identity || identity.status !== 'ACTIVE') throw new UnauthorizedException('Applicant account is inactive');
    return { id: identity.id, email: identity.email, emailVerifiedAt: identity.emailVerifiedAt, profile: identity.profile, companyIds: identity.companyApplicants.map((item) => item.tenantId) };
  }

  private async migrateLegacyAccount(accountId: string, email: string, passwordHash: string, legacy: any) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.applicantIdentity.upsert({
        where: { email },
        update: { legacyAccountId: accountId, passwordHash, preferredLocale: legacy.locale === 'en' ? 'en' : 'es' },
        create: { email, legacyAccountId: accountId, passwordHash, preferredLocale: legacy.locale === 'en' ? 'en' : 'es', profile: { create: { fullName: legacy.fullName, phone: legacy.phone, city: legacy.city, linkedinUrl: legacy.linkedinUrl, portfolioUrl: legacy.portfolioUrl, locale: legacy.locale, timezone: legacy.timezone } } },
      });
      for (const candidate of legacy.candidates) {
        await tx.companyApplicant.upsert({ where: { tenantId_identityId: { tenantId: candidate.tenantId, identityId: identity.id } }, update: {}, create: { tenantId: candidate.tenantId, identityId: identity.id, profileId: (await tx.applicantProfile.findUnique({ where: { identityId: identity.id } }))?.id } });
      }
      return identity;
    });
  }

  private async resolvePortal(slug?: string, invitationToken?: string) {
    const portal = await this.prisma.careerPortal.findFirst({
      where: {
        isActive: true,
        ...(slug
          ? { OR: [{ slug }, { tenant: { slug } }] }
          : { type: CareerPortalType.MARKETPLACE }),
      },
    });
    if (!portal) throw new NotFoundException('Career portal not found');
    if (portal.access === CareerPortalAccess.INVITATION_ONLY) {
      if (!invitationToken) throw new UnauthorizedException('A portal invitation is required');
      const invitation = await this.prisma.applicantInvitation.findFirst({ where: { portalId: portal.id, tokenHash: this.hash(invitationToken), acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!invitation) throw new UnauthorizedException('Portal invitation is invalid or expired');
    }
    return portal;
  }

  private async issueSession(identityId: string, email: string, portalId: string) {
    const raw = randomBytes(48).toString('base64url');
    const session = await this.prisma.portalApplicantSession.create({ data: { identityId, portalId, refreshTokenHash: this.hash(raw), expiresAt: this.refreshExpiry() } });
    return this.issueAccess(identityId, email, portalId, session.id, raw);
  }

  private async issueAccess(identityId: string, email: string, portalId: string, sid: string, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({ sub: identityId, email, audience: 'applicant', portalId, sid } satisfies ApplicantTokenPayload, { secret: this.secret(), expiresIn: '15m', audience: 'applicant' });
    return { accessToken, expiresIn: 900, refreshToken, applicant: await this.me(identityId) };
  }

  private refreshExpiry() { return new Date(Date.now() + 30 * 24 * 60 * 60_000); }
  private secret() { return this.config.get<string>('APPLICANT_JWT_SECRET') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET'); }
  private normalizeEmail(value: string) { return value.trim().toLowerCase(); }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
