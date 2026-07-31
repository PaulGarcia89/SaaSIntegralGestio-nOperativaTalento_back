import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TrainingQuizAttemptStatus, TrainingQuizQuestionType } from '@prisma/client';
import { TrainingAssessmentAdminService } from './training-assessment-admin.service';
import { TrainingService } from './training.service';

describe('training assessment authoring engine', () => {
  it('marks manual questions without a rubric as incomplete', async () => {
    const prisma = {
      trainingQuiz: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'quiz-1', randomQuestionCount: null, availableFrom: null, availableUntil: null,
          questions: [{
            questionType: TrainingQuizQuestionType.TEXT,
            requiresManualGrading: true,
            rubric: null,
            options: [],
          }],
        }]),
      },
    };
    const service = new TrainingAssessmentAdminService(prisma as any, {} as any);

    const result = await service.listQuizzes('tenant-1');

    expect(result.items[0].readiness.ready).toBe(false);
    expect(result.items[0].readiness.errors).toContain('Las preguntas manuales requieren una rúbrica');
  });

  it('rejects an order containing a question from another assessment', async () => {
    const prisma = {
      trainingQuiz: { findFirst: jest.fn().mockResolvedValue({ id: 'quiz-1', questions: [{ id: 'question-1', options: [] }] }) },
      trainingQuizQuestion: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new TrainingAssessmentAdminService(prisma as any, {} as any);

    await expect(service.reorderQuestions('tenant-1', 'quiz-1', {
      entityIds: ['foreign-question'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('training learner assessment engine', () => {
  const question = (id: string) => ({
    id,
    prompt: id,
    questionType: TrainingQuizQuestionType.SINGLE_CHOICE,
    points: 1,
    options: [{ id: `${id}-option`, label: 'Correcta', isCorrect: true }],
  });

  it('persists the exact random question selection on the attempt', async () => {
    const prisma = {
      trainingQuiz: { findUnique: jest.fn().mockResolvedValue({
        id: 'quiz-1', courseId: 'course-1', title: 'Final', description: null,
        passingScore: 80, maxAttempts: 3, timeLimitMinutes: 20,
        shuffleQuestions: false, shuffleOptions: false, randomQuestionCount: 1,
        cooldownMinutes: null, availableFrom: null, availableUntil: null,
        requireAllQuestions: true, course: { tenantId: 'tenant-1' },
        attempts: [], questions: [question('question-1'), question('question-2')],
      }) },
      trainingQuizAttempt: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'attempt-1', status: TrainingQuizAttemptStatus.IN_PROGRESS, ...data })) },
    };
    const service = new TrainingService(prisma as any, {} as any);

    const result = await service.createQuizAttempt('tenant-1', 'user-1', 'quiz-1');

    expect(prisma.trainingQuizAttempt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ questionIds: ['question-1'] }) });
    expect(result.quiz.questions).toHaveLength(1);
  });

  it('enforces the configured availability window', async () => {
    const prisma = { trainingQuiz: { findUnique: jest.fn().mockResolvedValue({
      id: 'quiz-1', course: { tenantId: 'tenant-1' }, attempts: [], questions: [question('question-1')],
      availableFrom: new Date(Date.now() + 60_000), availableUntil: null, maxAttempts: null,
    }) } };
    const service = new TrainingService(prisma as any, {} as any);

    await expect(service.createQuizAttempt('tenant-1', 'user-1', 'quiz-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
