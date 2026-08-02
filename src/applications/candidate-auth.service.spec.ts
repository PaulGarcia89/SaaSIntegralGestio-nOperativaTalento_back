import { CandidateAuthService } from './candidate-auth.service';

describe('CandidateAuthService', () => {
  const prisma = {
    candidateAccount: { findUnique: jest.fn() },
    candidateAccountToken: { updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
  };
  const jwt = { signAsync: jest.fn() };
  const configValues: Record<string, string> = { NODE_ENV: 'test', CANDIDATE_PORTAL_URL: 'https://careers.example.test' };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
    getOrThrow: jest.fn(),
  };
  const notifications = { createExternalEmail: jest.fn() };
  const service = new CandidateAuthService(prisma as never, jwt as never, config as never, notifications as never);

  beforeEach(() => jest.clearAllMocks());

  it('does not reveal whether an unknown candidate account exists', async () => {
    prisma.candidateAccount.findUnique.mockResolvedValue(null);
    await expect(service.forgotPassword('unknown@example.com')).resolves.toEqual({ accepted: true });
    expect(prisma.candidateAccountToken.create).not.toHaveBeenCalled();
    expect(notifications.createExternalEmail).not.toHaveBeenCalled();
  });

  it('queues a one-time reset link through the controlled notification outbox', async () => {
    prisma.candidateAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      email: 'candidate@example.com',
      isActive: true,
      locale: 'es',
      candidates: [{ tenantId: 'tenant-1' }],
    });
    prisma.candidateAccountToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.candidateAccountToken.create.mockResolvedValue({ id: 'token-1' });

    const result = await service.forgotPassword('Candidate@Example.com');

    expect(result).toEqual(expect.objectContaining({ accepted: true, developmentToken: expect.any(String) }));
    expect(prisma.candidateAccountToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: 'account-1', purpose: 'PASSWORD_RESET', tokenHash: expect.not.stringContaining('candidate') }),
    });
    expect(notifications.createExternalEmail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      recipientEmail: 'candidate@example.com',
      actionUrl: expect.stringContaining('/candidate/reset-password?token='),
    }));
  });
});
