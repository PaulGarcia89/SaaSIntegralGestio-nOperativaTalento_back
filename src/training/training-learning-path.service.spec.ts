import { TrainingLearningPathService } from './training-learning-path.service';

describe('TrainingLearningPathService', () => {
  it('assigns only matching onboarding rules and preserves tenant scope', async () => {
    const tx = {
      trainingAssignment: { create: jest.fn().mockResolvedValue({ id: 'assignment-1' }) },
      trainingProgress: { create: jest.fn().mockResolvedValue({ id: 'progress-1' }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notification-1' }) },
    };
    const prisma = {
      onboardingFlow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'flow-1',
          branchId: 'branch-1',
          employee: {
            email: 'learner@example.test',
            jobTitle: 'Coordinadora Clínica',
          },
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          userRoles: [{ role: { code: 'EMPLOYEE' } }],
        }),
      },
      trainingOnboardingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            createdById: 'admin-1',
            courseId: 'course-1',
            curriculumId: null,
            dueDays: 20,
            isRequired: true,
            jobTitlePattern: 'clínica',
            roleCode: 'EMPLOYEE',
          },
          {
            id: 'rule-2',
            createdById: 'admin-1',
            courseId: 'course-2',
            curriculumId: null,
            dueDays: 20,
            isRequired: true,
            jobTitlePattern: 'inventario',
            roleCode: null,
          },
        ]),
      },
      trainingAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const webhooks = { publish: jest.fn().mockResolvedValue({ queued: 1 }) };
    const service = new TrainingLearningPathService(prisma as never, webhooks as never);

    await expect(
      service.assignForOnboarding('tenant-1', 'flow-1', 'template-1'),
    ).resolves.toEqual({ assigned: 1 });

    expect(prisma.onboardingFlow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'flow-1', tenantId: 'tenant-1' } }),
    );
    expect(tx.trainingAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        courseId: 'course-1',
        sourceType: 'ONBOARDING',
      }),
    });
    expect(webhooks.publish).toHaveBeenCalledWith(
      'tenant-1',
      'training.onboarding_assigned',
      expect.objectContaining({ flowId: 'flow-1', userId: 'user-1' }),
    );
  });

  it('does not duplicate an assignment already created by another rule', async () => {
    const prisma = {
      onboardingFlow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'flow-1',
          branchId: 'branch-1',
          employee: { email: 'learner@example.test', jobTitle: 'Analista' },
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1', userRoles: [] }),
      },
      trainingOnboardingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            createdById: 'admin-1',
            courseId: 'course-1',
            curriculumId: null,
            dueDays: 30,
            isRequired: true,
            jobTitlePattern: null,
            roleCode: null,
          },
        ]),
      },
      trainingAssignment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-assignment' }),
      },
      $transaction: jest.fn(),
    };
    const webhooks = { publish: jest.fn() };
    const service = new TrainingLearningPathService(prisma as never, webhooks as never);

    await expect(
      service.assignForOnboarding('tenant-1', 'flow-1', 'template-1'),
    ).resolves.toEqual({ assigned: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(webhooks.publish).not.toHaveBeenCalled();
  });
});
