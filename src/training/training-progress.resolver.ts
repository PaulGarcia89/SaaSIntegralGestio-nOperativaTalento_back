import { TrainingProgressStatus } from '@prisma/client';

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'No iniciada',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  OVERDUE: 'Vencida',
};

export class TrainingProgressResolver {
  resolve(assignment: any, course?: any, curriculum?: any) {
    const status = this.effectiveStatus(assignment);
    const nextAction = this.nextAction(assignment, course, curriculum, status);
    const lastActivityAt = assignment.lastActivityAt
      ?? course?.progressRecords?.[0]?.lastActivityAt
      ?? assignment.updatedAt
      ?? null;

    return {
      status,
      displayStatus: STATUS_LABELS[status] ?? status,
      percentage: Number(assignment.progressPercent ?? course?.progressRecords?.[0]?.progressPercent ?? 0),
      dueAt: assignment.dueAt ?? null,
      isRequired: Boolean(assignment.isRequired),
      isOverdue: status === TrainingProgressStatus.OVERDUE,
      completedAt: assignment.completedAt ?? course?.progressRecords?.[0]?.completedAt ?? null,
      lastActivityAt,
      nextAction,
      completedItems: null,
      pendingItems: null,
      blockedItems: nextAction.blockers,
    };
  }

  private effectiveStatus(assignment: any) {
    if (assignment.status === TrainingProgressStatus.COMPLETED) return TrainingProgressStatus.COMPLETED;
    if (assignment.dueAt && new Date(assignment.dueAt) < new Date()) return TrainingProgressStatus.OVERDUE;
    return assignment.status ?? TrainingProgressStatus.NOT_STARTED;
  }

  private nextAction(assignment: any, course: any, curriculum: any, status: string) {
    if (status === TrainingProgressStatus.COMPLETED) {
      return { code: 'VIEW_COMPLETION', label: 'Ver finalización', enabled: true, courseId: assignment.courseId ?? null, curriculumId: assignment.curriculumId ?? null, lessonId: null, quizId: null, blockers: [] };
    }
    const statusBlockers = status === TrainingProgressStatus.OVERDUE
      ? [{ code: 'ASSIGNMENT_OVERDUE', message: 'La fecha límite de esta capacitación ya pasó.' }]
      : [];

    const firstPendingLesson = course?.modules
      ?.filter((module: any) => module.isRequired)
      ?.flatMap((module: any) => module.lessons ?? [])
      ?.find((lesson: any) => lesson.isRequired && !lesson.progressRecords?.[0]?.isCompleted && !lesson.completed);
    if (firstPendingLesson) {
      return { code: status === TrainingProgressStatus.NOT_STARTED ? 'START_LESSON' : 'CONTINUE_LESSON', label: status === TrainingProgressStatus.NOT_STARTED ? 'Iniciar lección' : 'Continuar lección', enabled: statusBlockers.length === 0, courseId: assignment.courseId ?? course.id ?? null, curriculumId: assignment.curriculumId ?? null, lessonId: firstPendingLesson.id, quizId: null, blockers: statusBlockers };
    }

    const pendingQuiz = course?.quizzes?.find((quiz: any) => !quiz.attempts?.some((attempt: any) => attempt.passed === true));
    if (pendingQuiz) {
      return { code: 'TAKE_ASSESSMENT', label: 'Presentar evaluación', enabled: statusBlockers.length === 0, courseId: assignment.courseId ?? course.id ?? null, curriculumId: assignment.curriculumId ?? null, lessonId: null, quizId: pendingQuiz.id, blockers: statusBlockers };
    }

    return { code: status === TrainingProgressStatus.NOT_STARTED ? 'START_COURSE' : 'CONTINUE_COURSE', label: status === TrainingProgressStatus.NOT_STARTED ? 'Iniciar capacitación' : 'Continuar capacitación', enabled: statusBlockers.length === 0, courseId: assignment.courseId ?? course?.id ?? null, curriculumId: assignment.curriculumId ?? curriculum?.id ?? null, lessonId: null, quizId: null, blockers: statusBlockers };
  }
}
