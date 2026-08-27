import { ApplicantAuthService } from './applicant-auth.service';

describe('ApplicantAuthService', () => {
  it('rotates a refresh token and rejects its reuse', async () => {
    const firstSession = { id: 'session-1', identityId: 'identity-1', portalId: 'portal-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000), identity: { id: 'identity-1', email: 'candidate@example.com' } };
    const prisma = {
      portalApplicantSession: {
        findUnique: jest.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce({ ...firstSession, status: 'REVOKED' }),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'session-2' }),
      },
      applicantIdentity: { findUnique: jest.fn().mockResolvedValue({ id: 'identity-1', email: 'candidate@example.com', status: 'ACTIVE', profile: null, companyApplicants: [] }) },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    } as any;
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as any;
    const config = { get: jest.fn().mockReturnValue('secret'), getOrThrow: jest.fn().mockReturnValue('secret') } as any;
    const service = new ApplicantAuthService(prisma, jwt, config);
    const first = await service.refresh('refresh-token');
    expect(first.accessToken).toBe('access-token');
    expect(prisma.portalApplicantSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1' }, data: expect.objectContaining({ status: 'REVOKED' }) }));
    await expect(service.refresh('refresh-token')).rejects.toThrow('Applicant refresh token is invalid or expired');
    expect(prisma.portalApplicantSession.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', portalId: 'portal-1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'REVOKED' }),
    });
  });
});
