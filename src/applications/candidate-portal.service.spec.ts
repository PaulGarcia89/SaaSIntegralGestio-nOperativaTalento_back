import AdmZip from 'adm-zip';
import { ApplicationStatus, ApplicationTimelineEventType, AtsCommunicationAudience, CandidatePrivacyRequestType } from '@prisma/client';
import { CandidatePortalService } from './candidate-portal.service';

describe('CandidatePortalService', () => {
  const tx = {
    vacancyApplication: { update: jest.fn() },
    applicationInterview: { updateMany: jest.fn() },
    applicationTimelineEvent: { create: jest.fn() },
  };
  const prisma = {
    candidateAccount: { findUnique: jest.fn() },
    atsMessage: { findMany: jest.fn() },
    candidateResumeFile: { findMany: jest.fn() },
    signatureParticipant: { findMany: jest.fn() },
    vacancyApplication: { findFirst: jest.fn() },
    candidatePrivacyRequest: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    candidateSupportRequest: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const files = { validateResume: jest.fn() };
  const antivirus = { scan: jest.fn() };
  const service = new CandidatePortalService(prisma as never, files as never, antivirus as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vacancyApplication.findFirst.mockResolvedValue({
      id: 'application-1',
      tenantId: 'tenant-1',
      status: ApplicationStatus.INTERVIEW,
      candidate: { fullName: 'Ana Candidate' },
    });
  });

  it('only exposes candidate communications in the candidate portal', async () => {
    prisma.candidateAccount.findUnique.mockResolvedValue({ email: 'ana@example.com' });
    prisma.atsMessage.findMany.mockResolvedValue([]);
    prisma.candidateResumeFile.findMany.mockResolvedValue([]);
    prisma.signatureParticipant.findMany.mockResolvedValue([]);
    prisma.candidatePrivacyRequest.findMany.mockResolvedValue([]);
    prisma.candidateSupportRequest.findMany.mockResolvedValue([]);

    const overview = await service.overview('account-1');

    expect(prisma.atsMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        audience: AtsCommunicationAudience.CANDIDATE,
      }),
    }));
    expect(overview.supportRequests).toEqual([]);
  });

  it('withdraws only the owner application and creates immutable timeline evidence', async () => {
    await service.withdraw('account-1', 'application-1', 'Accepted another role');

    expect(prisma.vacancyApplication.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'application-1',
        candidate: {
          OR: [
            { accountId: 'account-1' },
            { mergedCandidates: { some: { accountId: 'account-1' } } },
          ],
        },
      },
      include: { candidate: { select: { fullName: true } } },
    });
    expect(tx.vacancyApplication.update).toHaveBeenCalledWith({
      where: { id: 'application-1' },
      data: expect.objectContaining({ status: ApplicationStatus.WITHDRAWN }),
    });
    expect(tx.applicationInterview.updateMany).toHaveBeenCalled();
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: ApplicationTimelineEventType.APPLICATION_WITHDRAWN,
        actorType: 'CANDIDATE',
        actorId: 'account-1',
      }),
    });
  });

  it('deduplicates active privacy requests', async () => {
    prisma.candidatePrivacyRequest.findFirst.mockResolvedValue({ id: 'privacy-1', type: 'DELETE', status: 'PENDING' });
    const result = await service.requestPrivacy('account-1', { type: CandidatePrivacyRequestType.DELETE, reason: 'Please remove my profile' });
    expect(result).toEqual(expect.objectContaining({ id: 'privacy-1' }));
    expect(prisma.candidatePrivacyRequest.create).not.toHaveBeenCalled();
  });

  it('extracts reviewable profile fields from a validated DOCX resume', async () => {
    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from('<Types/>'));
    zip.addFile('word/document.xml', Buffer.from('<w:document><w:body><w:p><w:r><w:t>Ana Candidate</w:t></w:r></w:p><w:p><w:r><w:t>ana@example.com +1 305 555 0199 https://linkedin.com/in/ana</w:t></w:r></w:p></w:body></w:document>'));
    files.validateResume.mockReturnValue('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    antivirus.scan.mockResolvedValue({ status: 'CLEAN' });
    const buffer = zip.toBuffer();

    const result = await service.parseResume({ buffer, size: buffer.length } as Express.Multer.File);

    expect(result.requiresReview).toBe(true);
    expect(result.fields).toEqual(expect.objectContaining({ fullName: 'Ana Candidate', email: 'ana@example.com' }));
  });
});
