import { TrainingService } from './training.service';

describe('Training learner assessment contract', () => {
  it('does not expose correct answers or attempt answers in course detail', async () => {
    const service = new TrainingService({
      trainingPathCourse: { findMany: jest.fn().mockResolvedValue([]) },
      trainingCourse: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'course-1',
          title: 'Curso',
          summary: 'Resumen',
          description: 'Descripción',
          tenantId: 'tenant-1',
          isPublished: true,
          category: null,
          curriculum: null,
          steps: [],
          modules: [],
          assignments: [],
          progressRecords: [],
          favorites: [],
          certificates: [],
          quizzes: [{
            id: 'quiz-1',
            title: 'Evaluación',
            description: null,
            passingScore: 80,
            maxAttempts: 2,
            timeLimitMinutes: 30,
            shuffleQuestions: false,
            feedbackMode: 'AFTER_SUBMISSION',
            questions: [{ id: 'question-1', options: [{ id: 'option-1', label: 'Correcta', isCorrect: true }] }],
            attempts: [{
              id: 'attempt-1',
              status: 'GRADED',
              startedAt: new Date('2026-09-01T10:00:00.000Z'),
              submittedAt: new Date('2026-09-01T10:15:00.000Z'),
              expiresAt: new Date('2026-09-01T10:30:00.000Z'),
              score: 100,
              passed: true,
              gradedAt: new Date('2026-09-01T10:16:00.000Z'),
              feedback: 'Aprobado',
              answers: [{ questionId: 'question-1', isCorrect: true, awardedPoints: 1 }],
            }],
          }],
        }),
      },
      trainingLibraryResource: { findMany: jest.fn().mockResolvedValue([]) },
    } as any, {} as any);

    const result = await service.getCourseDetail('tenant-1', 'user-1', 'course-1');
    const quiz = result.quizSummary[0];

    expect(quiz.latestAttempt).toMatchObject({ id: 'attempt-1', score: 100, passed: true });
    expect(quiz.latestAttempt).not.toHaveProperty('answers');
    expect(quiz.latestAttempt).not.toHaveProperty('isCorrect');
    expect(quiz.attemptsUsed).toBe(1);
    expect(quiz.attemptsRemaining).toBe(1);
    expect(JSON.stringify(result)).not.toContain('isCorrect');
  });
});
