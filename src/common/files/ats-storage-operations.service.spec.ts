import { AtsFileStatus } from '@prisma/client';
import { AtsStorageOperationsService } from './ats-storage-operations.service';

describe('AtsStorageOperationsService', () => {
  const resumeRepository = {
    aggregate: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const imageRepository = {
    aggregate: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const prisma = {
    candidateResumeFile: resumeRepository,
    vacancyImageFile: imageRepository,
    user: { findMany: jest.fn() },
    notification: { upsert: jest.fn() },
  };
  const files = {
    delete: jest.fn(),
    storageConfiguration: jest.fn(() => ({
      driver: 's3',
      provider: 'R2',
      bucket: 'private',
      private: true,
      directSignedUrls: true,
      encryption: { enabled: true, mode: 'R2_MANAGED_AES_256' },
      endpointUsesTls: true,
      credentialsConfigured: true,
    })),
  };
  let service: AtsStorageOperationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    resumeRepository.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 }, _count: { _all: 0 } });
    imageRepository.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 }, _count: { _all: 0 } });
    resumeRepository.count.mockResolvedValue(0);
    imageRepository.count.mockResolvedValue(0);
    resumeRepository.findMany.mockResolvedValue([]);
    imageRepository.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    service = new AtsStorageOperationsService(prisma as never, files as never);
  });

  it('deletes an expired object before marking its database record as expired', async () => {
    resumeRepository.findMany.mockResolvedValue([{ id: 'resume-1', storageKey: 'tenant/resume/file.pdf' }]);
    files.delete.mockResolvedValue(undefined);
    resumeRepository.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.runMaintenance();

    expect(files.delete).toHaveBeenCalledWith('tenant/resume/file.pdf');
    expect(resumeRepository.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'resume-1' }),
      data: expect.objectContaining({ status: AtsFileStatus.EXPIRED }),
    }));
    expect(result.expiredResumes).toBe(1);
    expect(files.delete.mock.invocationCallOrder[0]).toBeLessThan(resumeRepository.updateMany.mock.invocationCallOrder[0]);
  });

  it('does not expire the record when object deletion fails', async () => {
    imageRepository.findMany.mockResolvedValue([{ id: 'image-1', storageKey: 'tenant/image/file.webp' }]);
    files.delete.mockRejectedValue(new Error('R2 unavailable'));

    const result = await service.runMaintenance();

    expect(imageRepository.updateMany).not.toHaveBeenCalled();
    expect(result.expiredImages).toBe(0);
  });

  it('deduplicates an alert for platform administrators after 8 GiB', async () => {
    const eightGiB = 8 * 1024 ** 3;
    resumeRepository.aggregate.mockResolvedValue({ _sum: { sizeBytes: eightGiB }, _count: { _all: 4 } });
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1', tenantId: 'platform-1' }]);
    prisma.notification.upsert.mockResolvedValue({ id: 'notification-1' });

    await service.runMaintenance();

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId_userId_deduplicationKey: {
          tenantId: 'platform-1',
          userId: 'admin-1',
          deduplicationKey: `ats-storage-threshold:${eightGiB}`,
        },
      },
    }));
  });
});
