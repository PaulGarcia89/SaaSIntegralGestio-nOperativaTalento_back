import { TrainingOperationKind, TrainingOperationStatus } from '@prisma/client';
import { TrainingOperationsService } from './training-operations.service';

describe('TrainingOperationsService', () => {
  it('executes due-course recovery only for the active tenant and records the result', async () => {
    const prisma = {
      trainingOperationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'run-1', ...data })),
      },
    };
    const courses = { processDueCourses: jest.fn().mockResolvedValue({ published: 2, retired: 1, skipped: false }) };
    const service = new TrainingOperationsService(prisma as any, courses as any, {} as any, {} as any);

    const result = await service.execute('tenant-1', 'admin-1', TrainingOperationKind.PROCESS_DUE_COURSES);

    expect(courses.processDueCourses).toHaveBeenCalledWith(expect.any(Date), 'tenant-1');
    expect(prisma.trainingOperationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-1', actorId: 'admin-1', status: TrainingOperationStatus.RUNNING }),
    });
    expect(result.status).toBe(TrainingOperationStatus.SUCCEEDED);
  });

  it('persists failed recovery details before propagating the error', async () => {
    const prisma = {
      trainingOperationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const launches = { processDueLaunches: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = new TrainingOperationsService(prisma as any, {} as any, launches as any, {} as any);

    await expect(service.execute('tenant-1', 'admin-1', TrainingOperationKind.PROCESS_DUE_LAUNCHES)).rejects.toThrow('database unavailable');
    expect(prisma.trainingOperationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: TrainingOperationStatus.FAILED, error: 'database unavailable' }),
    });
  });

  it('marks old tenant-scoped backlogs as critical', async () => {
    const old = new Date(Date.now() - 60 * 60_000);
    const prisma = {
      trainingCourse: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue({ scheduledPublishAt: old, scheduledRetireAt: null }),
      },
      trainingLaunch: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        findFirst: jest.fn().mockResolvedValue({ nextBatchAt: old }),
      },
      trainingWebhookDelivery: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(3),
        findFirst: jest.fn().mockResolvedValue({ createdAt: old }),
      },
      trainingOperationRun: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainingOperationsService(prisma as any, {} as any, {} as any, {} as any);

    const result = await service.overview('tenant-1');

    expect(result.health.status).toBe('CRITICAL');
    expect(result.health.score).toBeLessThan(50);
    expect(prisma.trainingCourse.count).toHaveBeenCalledWith({ where: expect.objectContaining({ tenantId: 'tenant-1' }) });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }));
  });
});
