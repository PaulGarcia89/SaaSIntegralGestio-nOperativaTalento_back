import { TrainingProgressStatus } from '@prisma/client';
import { TrainingAssignmentAdminService } from './training-assignment-admin.service';

describe('TrainingAssignmentAdminService', () => {
  it('builds a tenant-scoped, paginated and lightweight administrative listing', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn();
    const prisma = {
      trainingAssignment: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 0, 0, 0, 0, 0]),
    };
    const service = new TrainingAssignmentAdminService(prisma as any, {} as any);

    const result = await service.list('tenant-1', {
      page: 2,
      pageSize: 10,
      courseId: 'course-1',
      userId: 'user-1',
      branchId: 'branch-1',
      status: TrainingProgressStatus.IN_PROGRESS,
      isRequired: true,
      assignedFrom: '2026-09-01T00:00:00.000Z',
      dueTo: '2026-09-30T23:59:59.000Z',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        courseId: 'course-1',
        userId: 'user-1',
        status: TrainingProgressStatus.IN_PROGRESS,
        isRequired: true,
        createdAt: { gte: new Date('2026-09-01T00:00:00.000Z') },
        dueAt: { lte: new Date('2026-09-30T23:59:59.000Z') },
      }),
      skip: 10,
      take: 10,
      include: expect.objectContaining({
        course: { select: { id: true, title: true, coverImageUrl: true } },
      }),
    }));
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0, totalPages: 0 });
  });
});
