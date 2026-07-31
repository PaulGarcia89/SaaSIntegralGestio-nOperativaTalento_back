import { ConflictException } from '@nestjs/common';
import {
  TrainingCourseStatus,
  TrainingLaunchAudience,
  TrainingLaunchStatus,
  TrainingProgressStatus,
} from '@prisma/client';
import { TrainingLaunchService } from './training-launch.service';

const actor = {
  sub: 'admin-1',
  tenantId: 'tenant-1',
  activeTenantId: 'tenant-1',
  isSuperAdmin: false,
} as any;

describe('TrainingLaunchService', () => {
  it('freezes the active audience when a scheduled launch is created', async () => {
    const prisma = {
      trainingCourse: {
        findFirst: jest.fn().mockResolvedValue({ id: 'course-1', title: 'Seguridad' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      },
      trainingLaunch: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'launch-1',
          ...data,
          course: { id: 'course-1', title: 'Seguridad', version: 3 },
          assignments: [],
          nextAudienceIndex: 0,
        })),
      },
    };
    const service = new TrainingLaunchService(prisma as any, {} as any);
    const startAt = new Date(Date.now() + 86_400_000).toISOString();

    const result: any = await service.create('tenant-1', actor, {
      courseId: 'course-1',
      name: 'Lanzamiento anual',
      audience: TrainingLaunchAudience.BRANCHES,
      targetIds: ['branch-1'],
      startAt,
      batchSize: 25,
    });

    expect(prisma.trainingCourse.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: TrainingCourseStatus.PUBLISHED }),
    }));
    expect(prisma.trainingLaunch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resolvedUserIds: ['user-1', 'user-2'],
        status: TrainingLaunchStatus.SCHEDULED,
        batchSize: 25,
      }),
    }));
    expect(result.metrics.audience).toBe(2);
  });

  it('does not deploy a campaign before its scheduled date', async () => {
    const prisma = {
      trainingLaunch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'launch-1',
          tenantId: 'tenant-1',
          status: TrainingLaunchStatus.SCHEDULED,
          startAt: new Date(Date.now() + 60_000),
          assignments: [],
          resolvedUserIds: ['user-1'],
          nextAudienceIndex: 0,
        }),
      },
    };
    const service = new TrainingLaunchService(prisma as any, {} as any);

    await expect(service.deploy('tenant-1', 'launch-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('skips existing assignments and completes the final rollout batch', async () => {
    const launch = {
      id: 'launch-1',
      tenantId: 'tenant-1',
      courseId: 'course-1',
      createdById: 'admin-1',
      name: 'Piloto regional',
      status: TrainingLaunchStatus.DRAFT,
      resolvedUserIds: ['user-1', 'user-2'],
      nextAudienceIndex: 0,
      batchSize: 10,
      rolloutIntervalHours: 0,
      startAt: null,
      dueAt: null,
      isRequired: true,
      launchedAt: null,
      course: { id: 'course-1', title: 'Seguridad', version: 2 },
      assignments: [],
    };
    const tx = {
      trainingAssignment: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      trainingProgress: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      trainingLaunch: { update: jest.fn().mockResolvedValue({}) },
    };
    const completedLaunch = {
      ...launch,
      status: TrainingLaunchStatus.COMPLETED,
      nextAudienceIndex: 2,
      assignments: [{ status: TrainingProgressStatus.NOT_STARTED, progressPercent: 0, dueAt: null }],
    };
    const prisma = {
      trainingLaunch: {
        findFirst: jest.fn().mockResolvedValueOnce(launch).mockResolvedValueOnce(completedLaunch),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trainingAssignment: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }]),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const webhooks = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new TrainingLaunchService(prisma as any, webhooks as any);

    const result: any = await service.deploy('tenant-1', 'launch-1');

    expect(tx.trainingAssignment.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: 'user-2', launchId: 'launch-1' })],
      skipDuplicates: true,
    }));
    expect(tx.trainingLaunch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: TrainingLaunchStatus.COMPLETED, nextAudienceIndex: 2 }),
    }));
    expect(webhooks.publish).toHaveBeenCalledWith('tenant-1', 'course.launch.batch', expect.objectContaining({ userIds: ['user-2'] }));
    expect(result.metrics.assigned).toBe(1);
  });
});
