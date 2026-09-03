import { TrainingProgressStatus } from '@prisma/client';
import { TrainingService } from './training.service';

describe('Training idempotency', () => {
  it('returns the persisted course progress for a repeated request id', async () => {
    const previous = { id: 'progress-1', lastRequestId: 'request-1', progressPercent: 40, status: TrainingProgressStatus.IN_PROGRESS };
    const prisma = {
      trainingProgress: { findUnique: jest.fn().mockResolvedValue(previous), upsert: jest.fn() },
    };
    const service = new TrainingService(prisma as any, {} as any);
    jest.spyOn(service as any, 'assertCourseVisible').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'assertLearningPathCourseUnlocked').mockResolvedValue(undefined);

    const result = await service.updateCourseProgress('tenant-1', 'user-1', 'course-1', { progressPercent: 40 }, 'request-1');

    expect(result).toBe(previous);
    expect(prisma.trainingProgress.upsert).not.toHaveBeenCalled();
  });

  it('returns an already submitted attempt for a repeated submission request id', async () => {
    const attempt = { id: 'attempt-1', status: 'GRADED', submissionRequestId: 'request-2' };
    const prisma = { trainingQuizAttempt: { findFirst: jest.fn().mockResolvedValue(attempt), update: jest.fn() } };
    const service = new TrainingService(prisma as any, {} as any);

    const result = await service.submitQuizAttempt('tenant-1', 'user-1', 'quiz-1', 'attempt-1', {}, 'request-2');

    expect(result).toBe(attempt);
    expect(prisma.trainingQuizAttempt.update).not.toHaveBeenCalled();
  });

  it('returns the persisted lesson progress for a repeated request id', async () => {
    const previous = { id: 'lesson-progress-1', lastRequestId: 'request-3', isCompleted: true };
    const prisma = {
      trainingLesson: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lesson-1',
          module: { courseId: 'course-1', course: { tenantId: 'tenant-1', isPublished: true } },
        }),
      },
      trainingLessonProgress: { findFirst: jest.fn().mockResolvedValue(previous), upsert: jest.fn() },
    };
    const service = new TrainingService(prisma as any, {} as any);

    const result = await service.updateLessonProgress(
      'tenant-1',
      'user-1',
      'lesson-1',
      { completed: true },
      'request-3',
    );

    expect(result).toBe(previous);
    expect(prisma.trainingLessonProgress.upsert).not.toHaveBeenCalled();
  });
});
