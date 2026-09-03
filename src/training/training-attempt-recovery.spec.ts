import { TrainingService } from './training.service';

describe('Training attempt recovery', () => {
  it('returns server time and sanitized questions for the attempt owner', async () => {
    const prisma = {
      trainingQuizAttempt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attempt-1', tenantId: 'tenant-1', userId: 'user-1', quizId: 'quiz-1',
          status: 'IN_PROGRESS', startedAt: new Date(Date.now() - 60_000), submittedAt: null,
          expiresAt: new Date(Date.now() + 120_000), questionIds: ['question-1'],
          answers: [{ questionId: 'question-1', optionId: 'option-1', selectedOptionIds: ['option-1'], textAnswer: null }],
          quiz: { id: 'quiz-1' },
        }),
      },
      trainingQuizQuestion: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'question-1', prompt: 'Pregunta', questionType: 'SINGLE_CHOICE', points: 1,
          options: [{ id: 'option-1', label: 'Respuesta', isCorrect: true }],
        }]),
      },
    };
    const service = new TrainingService(prisma as any, {} as any);

    const result = await service.getQuizAttempt('tenant-1', 'user-1', 'quiz-1', 'attempt-1');

    expect(result.timeRemainingSeconds).toBeGreaterThan(0);
    expect(result.questions[0].options).toEqual([{ id: 'option-1', label: 'Respuesta' }]);
    expect(JSON.stringify(result)).not.toContain('isCorrect');
    expect(result.answers[0]).not.toHaveProperty('isCorrect');
  });

  it('does not recover an attempt across tenants or users', async () => {
    const prisma = { trainingQuizAttempt: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new TrainingService(prisma as any, {} as any);

    await expect(service.getQuizAttempt('tenant-2', 'user-2', 'quiz-1', 'attempt-1')).rejects.toThrow('attempt not found');
    expect(prisma.trainingQuizAttempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'attempt-1', tenantId: 'tenant-2', userId: 'user-2', quizId: 'quiz-1' },
    }));
  });
});
