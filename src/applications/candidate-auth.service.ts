import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { CandidateLoginDto, CandidateProfileDto, CandidateRegisterDto } from './dto/candidate-auth.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client';

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
    private readonly notifications: NotificationsService,
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

  async forgotPassword(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const account = await this.prisma.candidateAccount.findUnique({
      where: { email },
      include: { candidates: { select: { tenantId: true }, take: 1 } },
    });
    if (!account?.isActive) return { accepted: true };
    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.candidateAccountToken.updateMany({
        where: { accountId: account.id, purpose: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.candidateAccountToken.create({
        data: {
          accountId: account.id,
          purpose: 'PASSWORD_RESET',
          tokenHash: this.hash(rawToken),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      }),
    ]);
    const portalUrl = (this.config.get<string>('CANDIDATE_PORTAL_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${portalUrl}/candidate/reset-password?token=${encodeURIComponent(rawToken)}`;
    const tenantId = account.candidates[0]?.tenantId;
    if (tenantId) {
      await this.notifications.createExternalEmail({
        tenantId,
        recipientEmail: email,
        title: account.locale === 'en' ? 'Reset your candidate portal password' : 'Restablece tu contraseña del portal',
        message: account.locale === 'en' ? 'This secure link expires in 30 minutes.' : 'Este enlace seguro caduca en 30 minutos.',
        actionUrl: resetUrl,
        correlationId: `candidate-reset-${account.id}`,
        deduplicationKey: `candidate-reset-${account.id}-${Date.now()}`,
      });
    }
    return {
      accepted: true,
      ...(this.config.get<string>('NODE_ENV') !== 'production' ? { developmentToken: rawToken } : {}),
    };
  }

  async resetPassword(rawToken: string, password: string) {
    const token = await this.prisma.candidateAccountToken.findFirst({
      where: {
        tokenHash: this.hash(rawToken),
        purpose: 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { account: true },
    });
    if (!token?.account.isActive) throw new BadRequestException('Reset token is invalid or expired');
    await this.prisma.$transaction([
      this.prisma.candidateAccount.update({
        where: { id: token.accountId },
        data: { passwordHash: await bcrypt.hash(password, 12) },
      }),
      this.prisma.candidateAccountToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    ]);
    return this.issueToken(token.account.id, token.account.email);
  }

  async profile(accountId: string) {
    const account = await this.prisma.candidateAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true, email: true, fullName: true, phone: true, city: true, linkedinUrl: true,
        portfolioUrl: true, locale: true, timezone: true, statusUpdates: true,
        interviewReminders: true, offerNotifications: true, marketingConsent: true,
        profileSource: true, externalIdentities: { select: { provider: true } },
      },
    });
    if (!account) throw new UnauthorizedException('Candidate account not found');
    return account;
  }

  async updateProfile(accountId: string, dto: CandidateProfileDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.candidateAccount.update({ where: { id: accountId }, data: { ...dto, profileSource: 'MANUAL' } });
      await tx.candidate.updateMany({
        where: { accountId },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.linkedinUrl !== undefined ? { linkedinUrl: dto.linkedinUrl } : {}),
          ...(dto.portfolioUrl !== undefined ? { portfolioUrl: dto.portfolioUrl } : {}),
        },
      });
    });
    return this.profile(accountId);
  }

  async startSocial(providerInput: string, returnUrl?: string) {
    const provider = providerInput.toUpperCase();
    const social = this.socialConfig(provider);
    const portalOrigin = new URL(this.config.get<string>('CANDIDATE_PORTAL_URL') ?? 'http://localhost:3000').origin;
    let safeReturnUrl = `${portalOrigin}/apply`;
    if (returnUrl) {
      try {
        if (new URL(returnUrl).origin === portalOrigin) safeReturnUrl = returnUrl;
      } catch {
        throw new BadRequestException('Invalid social return URL');
      }
    }
    const state = randomBytes(32).toString('base64url');
    await this.prisma.candidateOAuthState.create({
      data: { provider, stateHash: this.hash(state), returnUrl: safeReturnUrl, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: social.clientId,
      redirect_uri: social.redirectUri,
      scope: social.scope,
      state,
    });
    return { provider, authorizationUrl: `${social.authorizationUrl}?${query.toString()}` };
  }

  async completeSocial(providerInput: string, state: string, code: string) {
    const provider = providerInput.toUpperCase();
    const oauthState = await this.prisma.candidateOAuthState.findFirst({
      where: { provider, stateHash: this.hash(state), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!oauthState) throw new BadRequestException('OAuth state is invalid or expired');
    const social = this.socialConfig(provider);
    const tokenResponse = await fetch(social.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: social.clientId,
        client_secret: social.clientSecret,
        redirect_uri: social.redirectUri,
      }),
    });
    if (!tokenResponse.ok) throw new BadRequestException(`${provider} authorization failed`);
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) throw new BadRequestException(`${provider} did not return an access token`);
    const profileResponse = await fetch(social.userInfoUrl, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
    });
    if (!profileResponse.ok) throw new BadRequestException(`${provider} profile import failed`);
    const external = await profileResponse.json() as Record<string, unknown>;
    const email = String(external.email ?? '').trim().toLowerCase();
    const subject = String(external.sub ?? external.id ?? '');
    const fullName = String(external.name ?? [external.given_name, external.family_name].filter(Boolean).join(' ')).trim();
    if (!email || !subject) throw new BadRequestException('The provider profile must include email and subject');
    const exchange = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.candidateAccount.upsert({
        where: { email },
        update: { fullName: fullName || undefined, profileSource: provider },
        create: {
          email,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
          fullName: fullName || undefined,
          profileSource: provider,
        },
      });
      await tx.candidateExternalIdentity.upsert({
        where: { provider_subject: { provider, subject } },
        update: { accountId: account.id, email, profileData: external as Prisma.InputJsonValue },
        create: { accountId: account.id, provider, subject, email, profileData: external as Prisma.InputJsonValue },
      });
      await tx.candidateAccountToken.create({
        data: {
          accountId: account.id,
          purpose: 'SOCIAL_EXCHANGE',
          tokenHash: this.hash(exchange),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });
      await tx.candidateOAuthState.update({ where: { id: oauthState.id }, data: { usedAt: new Date() } });
    });
    const destination = new URL(oauthState.returnUrl);
    destination.searchParams.set('socialCode', exchange);
    destination.searchParams.set('socialProvider', provider);
    return destination.toString();
  }

  async exchangeSocial(rawToken: string) {
    const token = await this.prisma.candidateAccountToken.findFirst({
      where: { tokenHash: this.hash(rawToken), purpose: 'SOCIAL_EXCHANGE', usedAt: null, expiresAt: { gt: new Date() } },
      include: { account: true },
    });
    if (!token?.account.isActive) throw new BadRequestException('Social exchange token is invalid or expired');
    await this.prisma.candidateAccountToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return this.issueToken(token.accountId, token.account.email);
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
    return { accessToken, expiresIn: 3600, candidate: await this.profile(accountId) };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private socialConfig(provider: string) {
    const apiBase = (this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001').replace(/\/$/, '');
    const configured = provider === 'LINKEDIN'
      ? {
          clientId: this.config.get<string>('LINKEDIN_CLIENT_ID'),
          clientSecret: this.config.get<string>('LINKEDIN_CLIENT_SECRET'),
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
          tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
          userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
          scope: 'openid profile email',
        }
      : provider === 'INDEED'
        ? {
            clientId: this.config.get<string>('INDEED_CLIENT_ID'),
            clientSecret: this.config.get<string>('INDEED_CLIENT_SECRET'),
            authorizationUrl: 'https://secure.indeed.com/oauth/v2/authorize',
            tokenUrl: 'https://apis.indeed.com/oauth/v2/tokens',
            userInfoUrl: 'https://secure.indeed.com/v2/api/userinfo',
            scope: 'openid email profile',
          }
        : null;
    if (!configured?.clientId || !configured.clientSecret) {
      throw new ServiceUnavailableException(`${provider} integration is not configured or approved`);
    }
    return {
      ...configured,
      clientId: configured.clientId,
      clientSecret: configured.clientSecret,
      redirectUri: `${apiBase}/candidate-auth/social/${provider.toLowerCase()}/callback`,
    };
  }
}
