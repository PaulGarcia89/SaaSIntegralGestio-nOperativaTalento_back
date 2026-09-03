import { TrainingProgressResolver } from './training-progress.resolver';

describe('TrainingProgressResolver', () => {
  const resolver = new TrainingProgressResolver();

  it('interprets persisted progress without changing its academic value', () => {
    const result = resolver.resolve({ id: 'assignment-1', courseId: 'course-1', status: 'IN_PROGRESS', progressPercent: 40, isRequired: true });

    expect(result).toMatchObject({ status: 'IN_PROGRESS', displayStatus: 'En progreso', percentage: 40, isRequired: true });
    expect(result.nextAction).toMatchObject({ code: 'CONTINUE_COURSE', enabled: true, courseId: 'course-1' });
  });

  it('identifies the first pending required lesson when detail data is available', () => {
    const result = resolver.resolve(
      { courseId: 'course-1', status: 'IN_PROGRESS', progressPercent: 50 },
      { id: 'course-1', modules: [{ isRequired: true, lessons: [{ id: 'lesson-1', isRequired: true, progressRecords: [] }] }] },
    );

    expect(result.nextAction).toMatchObject({ code: 'CONTINUE_LESSON', lessonId: 'lesson-1', enabled: true });
  });

  it('reports overdue assignments as blocked without changing completion', () => {
    const result = resolver.resolve({ courseId: 'course-1', status: 'IN_PROGRESS', progressPercent: 80, dueAt: new Date('2020-01-01') });

    expect(result).toMatchObject({ status: 'OVERDUE', percentage: 80, isOverdue: true });
    expect(result.nextAction.blockers).toEqual([{ code: 'ASSIGNMENT_OVERDUE', message: 'La fecha límite de esta capacitación ya pasó.' }]);
  });
});
