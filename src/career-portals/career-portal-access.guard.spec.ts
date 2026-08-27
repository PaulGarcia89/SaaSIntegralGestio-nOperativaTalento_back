import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CareerPortalAccessGuard } from './career-portal-access.guard';

describe('CareerPortalAccessGuard', () => {
  const prisma = {
    careerPortal: { findFirst: jest.fn() },
    applicantIdentity: { findFirst: jest.fn() },
    companyApplicant: { findFirst: jest.fn() },
    applicantInvitation: { findFirst: jest.fn() },
  } as any;
  const jwt = { verifyAsync: jest.fn() } as any;
  const config = { get: jest.fn().mockReturnValue('applicant-secret'), getOrThrow: jest.fn().mockReturnValue('fallback-secret') } as any;
  const guard = new CareerPortalAccessGuard(prisma, jwt, config);
  const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows a public portal resolved by its exact slug', async () => {
    prisma.careerPortal.findFirst.mockResolvedValue({ id: 'portal-1', access: 'PUBLIC', tenantId: 'tenant-1' });
    await expect(guard.canActivate(context({ params: { slug: 'acme' }, headers: {} }))).resolves.toBe(true);
    expect(prisma.careerPortal.findFirst).toHaveBeenCalledWith({ where: { isActive: true, OR: [{ slug: 'acme' }, { tenant: { slug: 'acme' } }] }, select: { id: true, access: true, tenantId: true } });
  });

  it('rejects direct URL access to a private portal without applicant auth', async () => {
    prisma.careerPortal.findFirst.mockResolvedValue({ id: 'portal-1', access: 'PRIVATE', tenantId: 'tenant-1' });
    await expect(guard.canActivate(context({ params: { slug: 'acme' }, headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows an authenticated applicant into a private portal without an invitation', async () => {
    prisma.careerPortal.findFirst.mockResolvedValue({ id: 'portal-1', access: 'PRIVATE', tenantId: 'tenant-1' });
    jwt.verifyAsync.mockResolvedValue({ sub: 'identity-1', email: 'candidate@example.com', audience: 'applicant', portalId: 'portal-1', sid: 'session-1' });
    prisma.applicantIdentity.findFirst.mockResolvedValue({ id: 'identity-1' });

    await expect(guard.canActivate(context({ params: { slug: 'acme' }, headers: { authorization: 'Bearer token' } }))).resolves.toBe(true);
    expect(prisma.applicantInvitation.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired or unknown invitation', async () => {
    prisma.careerPortal.findFirst.mockResolvedValue({ id: 'portal-1', access: 'INVITATION_ONLY', tenantId: 'tenant-1' });
    jwt.verifyAsync.mockResolvedValue({ sub: 'identity-1', email: 'candidate@example.com', audience: 'applicant', portalId: 'portal-1', sid: 'session-1' });
    prisma.applicantIdentity.findFirst.mockResolvedValue({ id: 'identity-1' });
    prisma.applicantInvitation.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(context({ params: { slug: 'acme' }, headers: { authorization: 'Bearer token', 'x-invitation-token': 'expired-token' } }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
