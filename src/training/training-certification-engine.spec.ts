import { BadRequestException } from '@nestjs/common';
import { TrainingQuizAttemptStatus } from '@prisma/client';
import { TrainingAssessmentAdminService } from './training-assessment-admin.service';
import { TrainingService } from './training.service';

describe('training certification policy', () => {
  it('rejects a renewal window that consumes the full validity period', async () => {
    const prisma = {
      trainingCourse: { findFirst: jest.fn().mockResolvedValue({ id: 'course-1' }) },
      trainingCertificationPolicy: { upsert: jest.fn() },
    };
    const service = new TrainingAssessmentAdminService(prisma as any, {} as any);

    await expect(service.updateCertificationPolicy('tenant-1', 'author-1', 'course-1', {
      isEnabled: true,
      autoIssue: true,
      requireAssessment: true,
      requireAllRequiredLessons: true,
      validityDays: 30,
      renewalWindowDays: 30,
      reminderDays: [7, 1],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingCertificationPolicy.upsert).not.toHaveBeenCalled();
  });

  it('renews into a new credential and supersedes the previous one atomically', async () => {
    const policy = { id: 'policy-1', version: 2, isEnabled: true, validityDays: 365, renewalWindowDays: 30 };
    const oldCertificate = {
      id: 'certificate-1', tenantId: 'tenant-1', userId: 'user-1', courseId: 'course-1',
      expiresAt: new Date(Date.now() + 5 * 86_400_000), revokedAt: null, supersededAt: null, policy,
    };
    const tx = {
      trainingCertificate: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'certificate-2', ...data })),
      },
    };
    const prisma = {
      trainingCertificate: { findFirst: jest.fn().mockResolvedValue(oldCertificate) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const webhooks = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new TrainingAssessmentAdminService(prisma as any, webhooks as any);

    const result = await service.renewCertificate('tenant-1', 'admin-1', 'certificate-1', {});

    expect(tx.trainingCertificate.update).toHaveBeenCalledWith({
      where: { id: 'certificate-1' },
      data: { supersededAt: expect.any(Date) },
    });
    expect(tx.trainingCertificate.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      renewedFromId: 'certificate-1', policyVersion: 2, issuedReason: 'RENEWAL',
    }) });
    expect(result.id).toBe('certificate-2');
  });
});

describe('automatic training certification', () => {
  const course = {
    id: 'course-1',
    certificationPolicy: {
      id: 'policy-1', version: 1, isEnabled: true, autoIssue: true,
      requireAssessment: true, requireAllRequiredLessons: true, validityDays: 365,
    },
    quizzes: [{ id: 'quiz-1' }],
    modules: [{ isRequired: true, lessons: [{ id: 'lesson-1', isRequired: true, progressRecords: [{ isCompleted: true }] }] }],
  };

  it('does not issue until every required assessment is passed', async () => {
    const prisma = {
      trainingCourse: { findFirst: jest.fn().mockResolvedValue(course) },
      trainingQuizAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      trainingCertificate: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new TrainingService(prisma as any, { publish: jest.fn() } as any);

    await (service as any).ensureCertificate('tenant-1', 'user-1', { courseId: 'course-1' });

    expect(prisma.trainingCertificate.create).not.toHaveBeenCalled();
  });

  it('issues once with an evidence snapshot after all requirements pass', async () => {
    const attempt = {
      id: 'attempt-1', quizId: 'quiz-1', score: 92, gradedAt: new Date(),
      status: TrainingQuizAttemptStatus.GRADED, passed: true,
    };
    const prisma = {
      trainingCourse: { findFirst: jest.fn().mockResolvedValue(course) },
      trainingQuizAttempt: { findMany: jest.fn().mockResolvedValue([attempt]) },
      trainingCertificate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'certificate-1', ...data })),
      },
    };
    const webhooks = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new TrainingService(prisma as any, webhooks as any);

    await (service as any).ensureCertificate('tenant-1', 'user-1', { courseId: 'course-1' });

    expect(prisma.trainingCertificate.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      policyId: 'policy-1', policyVersion: 1, issuedReason: 'COMPLETION',
      certificateNumber: expect.stringMatching(/^CERT-/),
      evidenceSnapshot: expect.objectContaining({ assessmentAttempts: [expect.objectContaining({ id: 'attempt-1', score: 92 })] }),
    }) });
    expect(webhooks.publish).toHaveBeenCalledWith(
      'tenant-1',
      'certificate.issued',
      expect.objectContaining({ certificateId: 'certificate-1' }),
      'certificate-issued-certificate-1',
    );
  });
});
