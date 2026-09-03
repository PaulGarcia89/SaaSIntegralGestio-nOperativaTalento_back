import { TrainingProgressStatus, TrainingQuizAttemptStatus } from '@prisma/client';
import { TrainingService } from './training.service';

describe('Training learner UX contracts', () => {
  it('calculates pending assessments without exposing answer data', async () => {
    const service = new TrainingService({
      trainingQuiz: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'quiz-1',
          courseId: 'course-1',
          title: 'Evaluación final',
          description: 'Validación',
          maxAttempts: 2,
          attempts: [{ status: TrainingQuizAttemptStatus.GRADED, passed: false, score: 60, createdAt: new Date() }],
          course: { id: 'course-1', title: 'Curso de inducción' },
        }]),
      },
    } as any, {} as any);
    jest.spyOn(service as any, 'findAssignments').mockResolvedValue([{
      id: 'assignment-1',
      courseId: 'course-1',
      status: TrainingProgressStatus.IN_PROGRESS,
    }]);
    jest.spyOn(service as any, 'findUpcomingEvents').mockResolvedValue([]);
    jest.spyOn(service as any, 'syncAnalyticsSnapshot').mockResolvedValue({ completionRate: 0, certificatesEarned: 0, totalMinutes: 0 });

    const overview = await service.getOverview('tenant-1', 'user-1');

    expect(overview.pendingAssessments).toMatchObject([{
      quizId: 'quiz-1',
      assignmentId: 'assignment-1',
      attemptsRemaining: 1,
      canStart: true,
    }]);
    expect(JSON.stringify(overview.pendingAssessments)).not.toContain('isCorrect');
  });

  it('returns database pagination metadata for assignments', async () => {
    const prisma = {
      trainingAssignment: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[{
        id: 'assignment-1',
        courseId: null,
        curriculumId: null,
        assignmentType: 'MANDATORY',
        progressPercent: 0,
        status: TrainingProgressStatus.NOT_STARTED,
        dueAt: null,
        isRequired: true,
        completedAt: null,
        course: null,
        curriculum: null,
      }], 21]),
    };
    const service = new TrainingService(prisma as any, {} as any);

    const result = await service.listAssignments('tenant-1', 'user-1', { page: 2, pageSize: 10 } as any);

    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 21, totalPages: 3 });
    expect(result.items).toHaveLength(1);
    expect(prisma.trainingAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });
});
