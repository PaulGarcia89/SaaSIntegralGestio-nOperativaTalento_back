import { BadRequestException } from '@nestjs/common';
import {
  TrainingImprovementStatus,
  TrainingProgressStatus,
} from '@prisma/client';
import { TrainingAnalyticsService } from './training-analytics.service';

describe('training effectiveness analytics', () => {
  it('detects low completion, overdue risk and lesson drop-off with sufficient evidence', async () => {
    const now = Date.now();
    const assignments = Array.from({ length: 10 }, (_, index) => ({
      courseId: 'course-1',
      userId: `user-${index}`,
      status: index < 3 ? TrainingProgressStatus.COMPLETED : index < 5 ? TrainingProgressStatus.IN_PROGRESS : TrainingProgressStatus.NOT_STARTED,
      progressPercent: index < 3 ? 100 : index < 5 ? 40 : 0,
      dueAt: index >= 5 ? new Date(now - 86_400_000) : new Date(now + 86_400_000),
      createdAt: new Date(now - 10 * 86_400_000),
      completedAt: index < 3 ? new Date(now - 2 * 86_400_000) : null,
    }));
    const prisma = {
      trainingCourse: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'course-1', title: 'Seguridad', version: 2,
          modules: [{ lessons: [{ id: 'lesson-1', title: 'Inicio', sortOrder: 0 }, { id: 'lesson-2', title: 'Práctica', sortOrder: 1 }] }],
        }]),
      },
      trainingAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
      trainingQuizAttempt: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 5 }, () => ({ score: 50, passed: false, quiz: { courseId: 'course-1' } }))) },
      trainingLessonProgress: { findMany: jest.fn().mockResolvedValue([
        ...Array.from({ length: 5 }, (_, index) => ({ lessonId: 'lesson-1', userId: `user-${index}` })),
        ...Array.from({ length: 3 }, (_, index) => ({ lessonId: 'lesson-2', userId: `user-${index}` })),
      ]) },
      trainingCoursePilot: { findMany: jest.fn().mockResolvedValue([]) },
      trainingLaunch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainingAnalyticsService(prisma as any);

    const result = await service.effectiveness('tenant-1', {});

    expect(result.courses[0].healthScore).toBeLessThan(60);
    expect(result.courses[0].signals.map((signal) => signal.code)).toEqual(expect.arrayContaining([
      'LOW_START_RATE',
      'LOW_COMPLETION_RATE',
      'HIGH_OVERDUE_RATE',
      'LOW_PASS_RATE',
      'LESSON_DROPOFF',
    ]));
    expect(result.summary.criticalSignals).toBeGreaterThan(0);
  });

  it('requires outcome evidence before an initiative can be completed', async () => {
    const prisma = {
      trainingCourseImprovement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'improvement-1', tenantId: 'tenant-1', status: TrainingImprovementStatus.VALIDATING }),
        update: jest.fn(),
      },
    };
    const service = new TrainingAnalyticsService(prisma as any);

    await expect(service.updateImprovement('tenant-1', 'improvement-1', {
      status: TrainingImprovementStatus.COMPLETED,
      outcomeNotes: 'Listo',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingCourseImprovement.update).not.toHaveBeenCalled();
  });

  it('rejects invalid workflow jumps in the improvement backlog', async () => {
    const prisma = {
      trainingCourseImprovement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'improvement-1', tenantId: 'tenant-1', status: TrainingImprovementStatus.OPEN }),
        update: jest.fn(),
      },
    };
    const service = new TrainingAnalyticsService(prisma as any);

    await expect(service.updateImprovement('tenant-1', 'improvement-1', {
      status: TrainingImprovementStatus.COMPLETED,
      outcomeNotes: 'Resultado validado correctamente',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingCourseImprovement.update).not.toHaveBeenCalled();
  });
});
