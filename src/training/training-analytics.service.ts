import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TrainingImprovementPriority,
  TrainingImprovementSource,
  TrainingImprovementStatus,
  TrainingProgressStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  TrainingAnalyticsQueryDto,
  CreateTrainingImprovementDto,
  ListTrainingImprovementsDto,
  UpdateTrainingImprovementDto,
  UpsertTrainingCompliancePolicyDto,
} from './dto/training-analytics.dto';

@Injectable()
export class TrainingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, query: TrainingAnalyticsQueryDto) {
    const now = new Date();
    const where = this.assignmentWhere(tenantId, query);
    const assignments = await this.prisma.trainingAssignment.findMany({
      where,
      include: {
        course: { select: { id: true, title: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            activeBranch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
    const courseIds = [...new Set(assignments.map((item) => item.courseId).filter(Boolean))] as string[];
    const attempts = await this.prisma.trainingQuizAttempt.findMany({
      where: {
        tenantId,
        quiz: { courseId: { in: courseIds } },
        ...(query.from || query.to
          ? {
              createdAt: {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to ? new Date(query.to) : undefined,
              },
            }
          : {}),
      },
      select: { passed: true, score: true, quiz: { select: { courseId: true } } },
    });
    const total = assignments.length;
    const completed = assignments.filter((item) => item.status === TrainingProgressStatus.COMPLETED).length;
    const inProgress = assignments.filter((item) => item.status === TrainingProgressStatus.IN_PROGRESS).length;
    const overdue = assignments.filter(
      (item) => item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED,
    ).length;
    const averageProgress =
      total === 0
        ? 0
        : Math.round(assignments.reduce((sum, item) => sum + item.progressPercent, 0) / total);
    const gradedAttempts = attempts.filter((attempt) => attempt.passed !== null);
    const passRate =
      gradedAttempts.length === 0
        ? 0
        : Math.round(
            (gradedAttempts.filter((attempt) => attempt.passed).length / gradedAttempts.length) * 100,
          );
    const byCourse = courseIds.map((courseId) => {
      const rows = assignments.filter((item) => item.courseId === courseId);
      const courseAttempts = attempts.filter((attempt) => attempt.quiz.courseId === courseId);
      return {
        courseId,
        title: rows[0]?.course?.title ?? 'Curso',
        assigned: rows.length,
        completed: rows.filter((item) => item.status === TrainingProgressStatus.COMPLETED).length,
        overdue: rows.filter(
          (item) => item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED,
        ).length,
        averageProgress:
          rows.length === 0
            ? 0
            : Math.round(rows.reduce((sum, item) => sum + item.progressPercent, 0) / rows.length),
        passRate:
          courseAttempts.length === 0
            ? 0
            : Math.round(
                (courseAttempts.filter((attempt) => attempt.passed).length / courseAttempts.length) *
                  100,
              ),
      };
    });
    return {
      generatedAt: new Date(),
      period: { from: query.from ?? null, to: query.to ?? null },
      summary: {
        assigned: total,
        uniqueLearners: new Set(assignments.map((item) => item.userId)).size,
        completed,
        inProgress,
        overdue,
        averageProgress,
        completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
        passRate,
      },
      byCourse,
      compliance: assignments.map((item) => ({
        assignmentId: item.id,
        learnerId: item.userId,
        learnerName: `${item.user.firstName} ${item.user.lastName}`.trim(),
        email: item.user.email,
        branch: item.user.activeBranch?.name ?? 'Sin sucursal',
        courseId: item.courseId,
        courseTitle: item.course?.title ?? 'Curso',
        status:
          item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED
            ? TrainingProgressStatus.OVERDUE
            : item.status,
        progressPercent: item.progressPercent,
        dueAt: item.dueAt,
        completedAt: item.completedAt,
      })),
    };
  }

  async effectiveness(tenantId: string, query: TrainingAnalyticsQueryDto) {
    const now = new Date();
    const courses = await this.prisma.trainingCourse.findMany({
      where: {
        id: query.courseId,
        OR: [{ tenantId }, { tenantId: null }],
        assignments: { some: { tenantId } },
      },
      select: {
        id: true,
        title: true,
        version: true,
        modules: {
          orderBy: { sortOrder: 'asc' },
          select: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true, sortOrder: true },
            },
          },
        },
      },
      orderBy: { title: 'asc' },
    });
    const courseIds = courses.map((course) => course.id);
    const lessonIds = courses.flatMap((course) => course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)));
    const [assignments, attempts, lessonProgress, pilots, launches] = await Promise.all([
      this.prisma.trainingAssignment.findMany({
        where: { ...this.assignmentWhere(tenantId, query), courseId: { in: courseIds } },
        select: { courseId: true, userId: true, status: true, progressPercent: true, dueAt: true, createdAt: true, completedAt: true },
      }),
      this.prisma.trainingQuizAttempt.findMany({
        where: {
          tenantId,
          quiz: { courseId: { in: courseIds } },
          submittedAt: { not: null },
          ...(query.from || query.to ? { submittedAt: { not: null, gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } } : {}),
        },
        select: { score: true, passed: true, quiz: { select: { courseId: true } } },
      }),
      this.prisma.trainingLessonProgress.findMany({
        where: { tenantId, lessonId: { in: lessonIds }, isCompleted: true },
        select: { lessonId: true, userId: true },
      }),
      this.prisma.trainingCoursePilot.findMany({
        where: { courseId: { in: courseIds }, tenantId },
        select: { courseId: true, feedback: { select: { rating: true, blockingIssue: true } } },
      }),
      this.prisma.trainingLaunch.findMany({
        where: { tenantId, courseId: { in: courseIds } },
        select: { courseId: true, resolvedUserIds: true, nextAudienceIndex: true },
      }),
    ]);

    const byCourse = courses.map((course) => {
      const rows = assignments.filter((item) => item.courseId === course.id);
      const userIds = new Set(rows.map((item) => item.userId));
      const graded = attempts.filter((item) => item.quiz.courseId === course.id && item.score !== null);
      const coursePilots = pilots.filter((item) => item.courseId === course.id);
      const feedback = coursePilots.flatMap((item) => item.feedback);
      const courseLaunches = launches.filter((item) => item.courseId === course.id);
      const assigned = rows.length;
      const started = rows.filter((item) => item.status !== TrainingProgressStatus.NOT_STARTED).length;
      const completed = rows.filter((item) => item.status === TrainingProgressStatus.COMPLETED).length;
      const overdue = rows.filter((item) => item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED).length;
      const completionRate = this.rate(completed, assigned);
      const startRate = this.rate(started, assigned);
      const overdueRate = this.rate(overdue, assigned);
      const passRate = this.rate(graded.filter((item) => item.passed).length, graded.length);
      const averageScore = graded.length ? Math.round(graded.reduce((sum, item) => sum + (item.score ?? 0), 0) / graded.length) : null;
      const averagePilotRating = feedback.length ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1)) : null;
      const blockingIssues = feedback.filter((item) => item.blockingIssue).length;
      const completionDurations = rows
        .filter((item) => item.completedAt)
        .map((item) => Math.max(0, (item.completedAt!.getTime() - item.createdAt.getTime()) / 86_400_000));
      const averageCompletionDays = completionDurations.length
        ? Number((completionDurations.reduce((sum, days) => sum + days, 0) / completionDurations.length).toFixed(1))
        : null;
      let previousCompletionRate: number | null = null;
      const lessonJourney = course.modules.flatMap((module) => module.lessons).map((lesson) => {
        const completedUsers = new Set(lessonProgress.filter((item) => item.lessonId === lesson.id && userIds.has(item.userId)).map((item) => item.userId)).size;
        const lessonCompletionRate = this.rate(completedUsers, assigned);
        const dropOffRate = previousCompletionRate === null ? 0 : Math.max(0, previousCompletionRate - lessonCompletionRate);
        previousCompletionRate = lessonCompletionRate;
        return { lessonId: lesson.id, title: lesson.title, completed: completedUsers, completionRate: lessonCompletionRate, dropOffRate };
      });
      const signals: Array<{ code: string; severity: 'MEDIUM' | 'HIGH' | 'CRITICAL'; title: string; detail: string; recommendation: string; evidence: Record<string, number | string> }> = [];
      if (assigned >= 5 && startRate < 60) signals.push({ code: 'LOW_START_RATE', severity: startRate < 35 ? 'CRITICAL' : 'HIGH', title: 'Baja adopción inicial', detail: `Solo ${startRate}% de la audiencia inició el curso.`, recommendation: 'Revisa comunicación, disponibilidad y relevancia de la asignación.', evidence: { assigned, started, startRate } });
      if (assigned >= 5 && completionRate < 70) signals.push({ code: 'LOW_COMPLETION_RATE', severity: completionRate < 40 ? 'CRITICAL' : 'HIGH', title: 'Finalización por debajo del objetivo', detail: `${completionRate}% completó el curso.`, recommendation: 'Reduce fricción, revisa carga y segmenta recordatorios.', evidence: { assigned, completed, completionRate } });
      if (assigned >= 5 && overdueRate > 15) signals.push({ code: 'HIGH_OVERDUE_RATE', severity: overdueRate > 35 ? 'CRITICAL' : 'HIGH', title: 'Vencimiento elevado', detail: `${overdueRate}% de las asignaciones está vencida.`, recommendation: 'Ajusta plazos y escala bloqueos con responsables operativos.', evidence: { assigned, overdue, overdueRate } });
      if (graded.length >= 5 && passRate < 70) signals.push({ code: 'LOW_PASS_RATE', severity: passRate < 45 ? 'CRITICAL' : 'HIGH', title: 'Baja aprobación', detail: `${passRate}% de los intentos evaluados fue aprobado.`, recommendation: 'Revisa alineación entre contenido, objetivos y dificultad de evaluación.', evidence: { attempts: graded.length, passRate, averageScore: averageScore ?? 0 } });
      const frictionLesson = lessonJourney.find((lesson) => lesson.completed >= 3 && lesson.dropOffRate >= 20);
      if (frictionLesson) signals.push({ code: 'LESSON_DROPOFF', severity: frictionLesson.dropOffRate >= 35 ? 'HIGH' : 'MEDIUM', title: 'Abandono concentrado en una lección', detail: `${frictionLesson.dropOffRate}% de caída al llegar a “${frictionLesson.title}”.`, recommendation: 'Revisa duración, claridad, accesibilidad y carga cognitiva de esa lección.', evidence: { lessonId: frictionLesson.lessonId, dropOffRate: frictionLesson.dropOffRate, completionRate: frictionLesson.completionRate } });
      if (blockingIssues > 0) signals.push({ code: 'PILOT_BLOCKERS', severity: 'CRITICAL', title: 'Bloqueos reportados en piloto', detail: `${blockingIssues} participante(s) reportaron un impedimento.`, recommendation: 'Resuelve los bloqueos antes de ampliar el lanzamiento.', evidence: { blockingIssues, feedbackResponses: feedback.length } });
      const healthComponents = [completionRate, startRate, Math.max(0, 100 - overdueRate)];
      if (graded.length) healthComponents.push(passRate);
      if (averagePilotRating !== null) healthComponents.push(averagePilotRating * 20);
      const healthScore = assigned ? Math.round(healthComponents.reduce((sum, value) => sum + value, 0) / healthComponents.length) : 0;
      return {
        courseId: course.id,
        title: course.title,
        version: course.version,
        healthScore,
        confidence: assigned >= 20 ? 'HIGH' : assigned >= 5 ? 'MEDIUM' : 'LOW',
        metrics: { assigned, started, completed, overdue, startRate, completionRate, overdueRate, attempts: graded.length, passRate, averageScore, averageCompletionDays, averagePilotRating, blockingIssues, launchAudience: courseLaunches.reduce((sum, item) => sum + item.resolvedUserIds.length, 0), launchProcessed: courseLaunches.reduce((sum, item) => sum + item.nextAudienceIndex, 0) },
        lessonJourney,
        signals,
      };
    });
    return {
      generatedAt: now,
      period: { from: query.from ?? null, to: query.to ?? null },
      summary: {
        courses: byCourse.length,
        averageHealthScore: byCourse.length ? Math.round(byCourse.reduce((sum, item) => sum + item.healthScore, 0) / byCourse.length) : 0,
        criticalSignals: byCourse.flatMap((item) => item.signals).filter((signal) => signal.severity === 'CRITICAL').length,
        openSignals: byCourse.reduce((sum, item) => sum + item.signals.length, 0),
      },
      courses: byCourse,
    };
  }

  async listImprovements(tenantId: string, query: ListTrainingImprovementsDto) {
    return {
      items: await this.prisma.trainingCourseImprovement.findMany({
        where: { tenantId, courseId: query.courseId, status: query.status },
        include: {
          course: { select: { id: true, title: true, version: true } },
          owner: { select: { id: true, firstName: true, lastName: true, email: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    };
  }

  async createImprovement(tenantId: string, actorId: string, dto: CreateTrainingImprovementDto) {
    const course = await this.prisma.trainingCourse.findFirst({ where: { id: dto.courseId, OR: [{ tenantId }, { tenantId: null }] }, select: { id: true } });
    if (!course) throw new NotFoundException('Training course not found');
    if (dto.ownerId) await this.assertActiveOwner(tenantId, dto.ownerId);
    if (dto.signalCode) {
      const duplicate = await this.prisma.trainingCourseImprovement.findFirst({
        where: {
          tenantId,
          courseId: course.id,
          signalCode: dto.signalCode,
          status: { notIn: [TrainingImprovementStatus.COMPLETED, TrainingImprovementStatus.DISMISSED] },
        },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('An active improvement already exists for this signal');
    }
    return this.prisma.trainingCourseImprovement.create({
      data: {
        tenantId,
        courseId: course.id,
        ownerId: dto.ownerId,
        createdById: actorId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        priority: dto.priority ?? TrainingImprovementPriority.MEDIUM,
        source: dto.source ?? TrainingImprovementSource.MANUAL,
        signalCode: dto.signalCode,
        evidence: dto.evidence as Prisma.InputJsonValue | undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: { course: { select: { id: true, title: true, version: true } }, owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async updateImprovement(tenantId: string, id: string, dto: UpdateTrainingImprovementDto) {
    const current = await this.prisma.trainingCourseImprovement.findFirst({ where: { id, tenantId } });
    if (!current) throw new NotFoundException('Training improvement not found');
    if (dto.ownerId) await this.assertActiveOwner(tenantId, dto.ownerId);
    const transitions: Record<TrainingImprovementStatus, TrainingImprovementStatus[]> = {
      OPEN: [TrainingImprovementStatus.PLANNED, TrainingImprovementStatus.DISMISSED],
      PLANNED: [TrainingImprovementStatus.IN_PROGRESS, TrainingImprovementStatus.DISMISSED],
      IN_PROGRESS: [TrainingImprovementStatus.VALIDATING, TrainingImprovementStatus.PLANNED],
      VALIDATING: [TrainingImprovementStatus.COMPLETED, TrainingImprovementStatus.IN_PROGRESS],
      COMPLETED: [],
      DISMISSED: [TrainingImprovementStatus.OPEN],
    };
    if (dto.status && dto.status !== current.status && !transitions[current.status].includes(dto.status)) {
      throw new BadRequestException(`Cannot transition improvement from ${current.status} to ${dto.status}`);
    }
    if (dto.status === TrainingImprovementStatus.COMPLETED && (!dto.outcomeNotes || dto.outcomeNotes.trim().length < 10)) {
      throw new BadRequestException('Outcome notes are required to complete an improvement');
    }
    return this.prisma.trainingCourseImprovement.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        ownerId: dto.ownerId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        outcomeNotes: dto.outcomeNotes?.trim(),
        completedAt: dto.status === TrainingImprovementStatus.COMPLETED ? new Date() : undefined,
      },
      include: { course: { select: { id: true, title: true, version: true } }, owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async listPolicies(tenantId: string) {
    return {
      items: await this.prisma.trainingCompliancePolicy.findMany({
        where: { tenantId },
        include: { course: { select: { id: true, title: true, status: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async upsertPolicy(
    tenantId: string,
    actorId: string,
    dto: UpsertTrainingCompliancePolicyDto,
  ) {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: dto.courseId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!course) throw new NotFoundException('Training course not found');
    return this.prisma.trainingCompliancePolicy.upsert({
      where: { tenantId_courseId: { tenantId, courseId: dto.courseId } },
      update: {
        isActive: dto.isActive ?? true,
        dueDays: dto.dueDays,
        renewalDays: dto.renewalDays ?? null,
        reminderDays: [...new Set(dto.reminderDays)].sort((a, b) => b - a),
      },
      create: {
        tenantId,
        courseId: dto.courseId,
        createdById: actorId,
        isActive: dto.isActive ?? true,
        dueDays: dto.dueDays,
        renewalDays: dto.renewalDays,
        reminderDays: [...new Set(dto.reminderDays)].sort((a, b) => b - a),
      },
      include: { course: { select: { id: true, title: true } } },
    });
  }

  private assignmentWhere(
    tenantId: string,
    query: TrainingAnalyticsQueryDto,
  ): Prisma.TrainingAssignmentWhereInput {
    return {
      tenantId,
      courseId: query.courseId,
      ...(query.from || query.to
        ? {
            createdAt: {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            },
          }
        : {}),
      ...(query.branchId
        ? {
            user: {
              OR: [
                { activeBranchId: query.branchId },
                { branchAccesses: { some: { branchId: query.branchId } } },
              ],
            },
          }
        : {}),
    };
  }

  private rate(value: number, total: number) {
    return total ? Math.round((value / total) * 100) : 0;
  }

  private async assertActiveOwner(tenantId: string, ownerId: string) {
    const owner = await this.prisma.user.findFirst({ where: { id: ownerId, tenantId, status: UserStatus.ACTIVE }, select: { id: true } });
    if (!owner) throw new BadRequestException('Improvement owner must be an active user in the tenant');
  }
}
