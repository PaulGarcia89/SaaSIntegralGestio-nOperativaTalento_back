import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  ModuleCode,
  Prisma,
  TrainingCourseStepType,
  TrainingEventAttendanceStatus,
  TrainingFavoriteEntityType,
  TrainingProgressStatus,
  TrainingPilotStatus,
  TrainingQuizAttemptStatus,
  TrainingQuizQuestionType,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateTrainingQuizAttemptAnswerDto } from './dto/create-training-quiz-attempt-answer.dto';
import { ListTrainingAssignmentsDto } from './dto/list-training-assignments.dto';
import { ListTrainingCatalogDto } from './dto/list-training-catalog.dto';
import { ListTrainingEventsDto } from './dto/list-training-events.dto';
import { ListTrainingLibraryDto } from './dto/list-training-library.dto';
import { SubmitTrainingQuizAttemptDto } from './dto/submit-training-quiz-attempt.dto';
import { TrainingFavoriteDto } from './dto/training-favorite.dto';
import { UpdateTrainingCourseProgressDto } from './dto/update-training-course-progress.dto';
import { UpdateTrainingStepProgressDto } from './dto/update-training-step-progress.dto';
import { UpdateTrainingLessonProgressDto } from './dto/training-assignment-admin.dto';
import { SubmitTrainingPilotFeedbackDto } from './dto/training-course-authoring.dto';
import { randomBytes } from 'node:crypto';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';
import { TrainingProgressResolver } from './training-progress.resolver';

@Injectable()
export class TrainingService {
  private readonly progressResolver: TrainingProgressResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: TrainingWebhookDeliveryService,
    @Optional() progressResolver?: TrainingProgressResolver,
  ) {
    this.progressResolver = progressResolver ?? new TrainingProgressResolver();
  }

  async assertModuleEnabled(tenantId: string, user: JwtPayload) {
    const access = await this.getModuleAccess(tenantId, user);
    if (!access.enabled) {
      throw new ForbiddenException(access.reason ?? 'Training module is not enabled');
    }
    return access;
  }

  async getModuleAccess(tenantId: string, user: JwtPayload) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            planModules: {
              include: {
                module: true,
              },
            },
          },
        },
      },
    });

    if (user.isSuperAdmin) {
      return {
        enabled: true,
        reason: null,
        subscriptionId: subscription?.id ?? null,
        planId: subscription?.planId ?? null,
      };
    }

    if (!subscription) {
      await this.persistModuleAccess(tenantId, null, null, false);
      return {
        enabled: false,
        reason: 'Tenant has no subscription assigned',
        subscriptionId: null,
        planId: null,
      };
    }

    const enabled = subscription.plan.planModules.some((entry) => entry.module.code === ModuleCode.TRAINING);
    await this.persistModuleAccess(tenantId, subscription.id, subscription.planId, enabled);

    return {
      enabled,
      reason: enabled ? null : 'Module TRAINING is not enabled for this tenant plan',
      subscriptionId: subscription.id,
      planId: subscription.planId,
    };
  }

  async getOverview(tenantId: string, userId: string) {
    const [assignments, upcomingEvents, analyticsSnapshot] = await Promise.all([
      this.findAssignments(tenantId, userId),
      this.findUpcomingEvents(tenantId, userId),
      this.syncAnalyticsSnapshot(tenantId, userId),
    ]);
    const pendingAssessments = await this.findPendingAssessments(tenantId, userId, assignments);

    const overdueAssignments = assignments.filter((item) => item.status === TrainingProgressStatus.OVERDUE);
    const inProgressAssignments = assignments.filter(
      (item) => item.status === TrainingProgressStatus.IN_PROGRESS,
    );
    const completedAssignments = assignments.filter(
      (item) => item.status === TrainingProgressStatus.COMPLETED,
    );
    const attentionRequired = assignments
      .filter((item) => item.status === TrainingProgressStatus.OVERDUE)
      .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
    const upcomingDue = assignments
      .filter((item) => item.status !== TrainingProgressStatus.COMPLETED && item.status !== TrainingProgressStatus.OVERDUE && item.dueAt)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    const recentlyCompleted = [...completedAssignments]
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
      .slice(0, 6);
    const optionalAssignments = assignments.filter((item) => !item.isRequired);

    return {
      overdueAssignments,
      inProgressAssignments,
      completedAssignments,
      attentionRequired,
      upcomingDue,
      pendingAssessments,
      continueLearning: inProgressAssignments.slice(0, 6),
      newAssignments: assignments
        .filter((item) => item.status === TrainingProgressStatus.NOT_STARTED)
        .sort((a, b) => Number(b.isRequired) - Number(a.isRequired))
        .slice(0, 6),
      recentlyCompleted,
      optionalAssignments,
      upcomingEvents,
      analyticsSnapshot,
      objectiveProgress: [
        { id: 'completion-rate', title: 'Avance general', value: analyticsSnapshot.completionRate },
        { id: 'certificates', title: 'Certificados', value: analyticsSnapshot.certificatesEarned },
        { id: 'minutes', title: 'Minutos completados', value: analyticsSnapshot.totalMinutes },
      ],
      pendingPolls: [],
      tabsSummary: {
        overviewCount: assignments.length,
        inProgressCount: inProgressAssignments.length,
        completedCount: completedAssignments.length,
      },
    };
  }

  async listAssignments(tenantId: string, userId: string, query: ListTrainingAssignmentsDto) {
    const pagination = normalizeOffsetPagination(query);
    const now = new Date();
    const filters: Prisma.TrainingAssignmentWhereInput[] = [];
    if (query.status === TrainingProgressStatus.OVERDUE) {
      filters.push({ status: { not: TrainingProgressStatus.COMPLETED }, dueAt: { lt: now } });
    } else if (query.status === TrainingProgressStatus.IN_PROGRESS || query.status === TrainingProgressStatus.NOT_STARTED) {
      filters.push({
        status: query.status,
        OR: [{ dueAt: null }, { dueAt: { gte: now } }],
      });
    } else if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.search) {
      filters.push({
        OR: [
          { course: { title: { contains: query.search, mode: 'insensitive' } } },
          { curriculum: { title: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.TrainingAssignmentWhereInput = {
      tenantId,
      userId,
      ...(query.type ? { assignmentType: query.type } : {}),
      ...(filters.length ? { AND: filters } : {}),
    };
    const orderBy: Prisma.TrainingAssignmentOrderByWithRelationInput[] = query.sort === 'progress'
      ? [{ progressPercent: query.order === 'asc' ? 'asc' : 'desc' }, { updatedAt: 'desc' }]
      : query.sort === 'title'
        ? [{ createdAt: 'desc' }]
        : [{ dueAt: query.order === 'asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }];
    const [records, total] = await this.prisma.$transaction([
      this.prisma.trainingAssignment.findMany({
        where,
        include: {
          course: { include: { category: true, favorites: { where: { tenantId, userId } } } },
          curriculum: { include: { category: true, favorites: { where: { tenantId, userId } } } },
        },
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.trainingAssignment.count({ where }),
    ]);
    const items = (records as any[])
      .map((item) => this.mapAssignmentRecord(item, item.course, item.curriculum))
      .map((item) => ({
        ...item,
        overdue: Boolean(item.dueAt && new Date(item.dueAt) < now && item.status !== TrainingProgressStatus.COMPLETED),
      }));

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    };
  }

  async listCatalog(tenantId: string, userId: string, query: ListTrainingCatalogDto) {
    const pagination = normalizeOffsetPagination(query);
    const assignedOnly = query.assignedOnly === 'true';
    const favoritesOnly = query.favoritesOnly === 'true';

    const where: Prisma.TrainingCourseWhereInput = {
      isPublished: true,
      OR: [{ tenantId: null }, { tenantId }],
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(assignedOnly ? { assignments: { some: { tenantId, userId } } } : {}),
      ...(favoritesOnly ? { favorites: { some: { tenantId, userId } } } : {}),
    };

    const [courses, categories, total] = await this.prisma.$transaction([
      this.prisma.trainingCourse.findMany({
        where,
        include: {
          category: true,
          assignments: { where: { tenantId, userId } },
          progressRecords: { where: { tenantId, userId } },
          favorites: { where: { tenantId, userId } },
          certificates: { where: { tenantId, userId } },
        },
        orderBy: query.sort === 'title' ? { title: 'asc' } : { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.trainingCategory.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, { tenantId }] },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.trainingCourse.count({ where }),
    ]);

    return {
      items: courses.map((course) => this.mapCourseCard(course)),
      total,
      filters: { categories },
    };
  }

  async listLibrary(tenantId: string, userId: string, query: ListTrainingLibraryDto) {
    const pagination = normalizeOffsetPagination(query);
    const favoritesOnly = query.favoritesOnly === 'true';

    const where: Prisma.TrainingLibraryResourceWhereInput = {
      isPublished: true,
      OR: [{ tenantId: null }, { tenantId }],
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.featured === 'true' ? { isFeatured: true } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(favoritesOnly ? { favorites: { some: { tenantId, userId } } } : {}),
    };

    const [items, categories] = await this.prisma.$transaction([
      this.prisma.trainingLibraryResource.findMany({
        where,
        include: {
          category: true,
          favorites: { where: { tenantId, userId } },
        },
        orderBy: query.sort === 'title' ? { title: 'asc' } : [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.trainingCategory.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, { tenantId }] },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        resourceType: item.resourceType,
        thumbnailUrl: item.thumbnailUrl,
        fileUrl: item.fileUrl,
        externalUrl: item.externalUrl,
        sizeBytes: item.sizeBytes,
        durationSeconds: item.durationSeconds,
        favorite: item.favorites.length > 0,
        category: item.category,
      })),
      categories,
    };
  }

  async listEvents(tenantId: string, userId: string, query: ListTrainingEventsDto) {
    const attendances = await this.prisma.trainingEventAttendance.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
        event: {
          tenantId,
          ...(query.from || query.to
            ? {
                startsAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
        },
      },
      include: { event: true },
      orderBy: { event: { startsAt: 'asc' } },
    });

    return {
      items: attendances.map((attendance) => this.mapEvent(attendance.event, attendance.status)),
    };
  }

  async getAnalytics(tenantId: string, userId: string) {
    const [snapshot, courseProgress, curriculumProgress, eventAttendances, assignments] = await Promise.all([
      this.syncAnalyticsSnapshot(tenantId, userId),
      this.prisma.trainingProgress.findMany({
        where: { tenantId, userId, courseId: { not: null } },
        include: { course: true },
      }),
      this.prisma.trainingProgress.findMany({
        where: { tenantId, userId, curriculumId: { not: null } },
        include: { curriculum: true },
      }),
      this.prisma.trainingEventAttendance.findMany({
        where: { userId, event: { tenantId } },
        include: { event: true },
      }),
      this.findAssignments(tenantId, userId),
    ]);

    return {
      summaryCards: snapshot,
      curriculumProgress: curriculumProgress.map((item) => ({
        id: item.curriculumId,
        title: item.curriculum?.title ?? 'Curriculum',
        progressPercent: item.progressPercent,
        status: item.status,
      })),
      courseProgress: courseProgress.map((item) => ({
        id: item.courseId,
        title: item.course?.title ?? 'Course',
        progressPercent: item.progressPercent,
        status: item.status,
      })),
      eventProgress: eventAttendances.map((item) => ({
        id: item.eventId,
        title: item.event.title,
        attendanceStatus: item.status,
        startsAt: item.event.startsAt,
      })),
      assignmentInsights: assignments,
    };
  }

  async getCourseDetail(tenantId: string, userId: string, courseId: string) {
    await this.assertLearningPathCourseUnlocked(tenantId, userId, courseId);
    const course = await this.prisma.trainingCourse.findFirst({
      where: {
        id: courseId,
        AND: [
          { OR: [{ tenantId: null }, { tenantId }] },
          {
            OR: [
              { isPublished: true },
              {
                pilots: {
                  some: {
                    tenantId,
                    status: TrainingPilotStatus.ACTIVE,
                    participantIds: { has: userId },
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        category: true,
        curriculum: true,
        steps: {
          include: {
            progressRecords: { where: { tenantId, userId } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: {
                blocks: { orderBy: { sortOrder: 'asc' } },
                progressRecords: { where: { tenantId, userId } },
                videoProgress: { where: { tenantId, userId } },
              },
            },
          },
        },
        assignments: { where: { tenantId, userId } },
        progressRecords: { where: { tenantId, userId } },
        favorites: { where: { tenantId, userId } },
        certificates: { where: { tenantId, userId } },
        quizzes: {
          include: {
            questions: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
            attempts: {
              where: { tenantId, userId },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Training course not found');
    }

    const relatedResources = await this.prisma.trainingLibraryResource.findMany({
      where: {
        isPublished: true,
        OR: [{ tenantId: null }, { tenantId }],
        ...(course.categoryId ? { categoryId: course.categoryId } : {}),
      },
      include: {
        category: true,
        favorites: { where: { tenantId, userId } },
      },
      take: 4,
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    });

    const assignment = course.assignments[0] ? this.mapAssignmentRecord(course.assignments[0], course) : null;
    const nextLessonId = assignment?.progress?.nextAction?.lessonId ?? null;
    const nextLesson = nextLessonId
      ? course.modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === nextLessonId) ?? null
      : null;

    return {
      ...this.mapCourseCard(course),
      description: course.description,
      curriculum: course.curriculum,
      resourceUrl: course.resourceUrl,
      steps: course.steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        stepType: step.stepType,
        contentUrl: step.contentUrl,
        sortOrder: step.sortOrder,
        estimatedMinutes: step.estimatedMinutes,
        isRequired: step.isRequired,
        progress: step.progressRecords[0]
          ? {
              isCompleted: step.progressRecords[0].isCompleted,
              completedAt: step.progressRecords[0].completedAt,
              score: step.progressRecords[0].score,
              timeSpentSeconds: step.progressRecords[0].timeSpentSeconds,
            }
          : null,
      })),
      modules: course.modules.map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        sortOrder: module.sortOrder,
        isRequired: module.isRequired,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          sortOrder: lesson.sortOrder,
          estimatedMinutes: lesson.estimatedMinutes,
          isRequired: lesson.isRequired,
          type: lesson.type,
          videoUrl: lesson.videoUrl ?? (lesson.videoStorageKey && course.assignments[0]
            ? `/api/training/video/assignments/${course.assignments[0].id}/lessons/${lesson.id}/file`
            : null),
          thumbnailUrl: lesson.thumbnailUrl,
          durationSeconds: lesson.durationSeconds,
          requiredCompletionPercentage: lesson.requiredCompletionPercentage,
          completed: lesson.progressRecords[0]?.isCompleted ?? false,
          completedAt: lesson.progressRecords[0]?.completedAt ?? null,
          videoProgress: lesson.videoProgress[0]
            ? {
                lastPositionSeconds: lesson.videoProgress[0].lastPositionSeconds,
                watchedSeconds: lesson.videoProgress[0].watchedSeconds,
                completionPercentage: lesson.videoProgress[0].completionPercentage,
                playbackSessionId: lesson.videoProgress[0].playbackSessionId,
                completedAt: lesson.videoProgress[0].completedAt,
              }
            : null,
          blocks: lesson.blocks,
        })),
      })),
      progress: course.progressRecords[0] ?? null,
      quizSummary: course.quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        timeLimitMinutes: quiz.timeLimitMinutes,
        shuffleQuestions: quiz.shuffleQuestions,
        questionsCount: quiz.questions.length,
        attemptsUsed: quiz.attempts.length,
        attemptsRemaining: quiz.maxAttempts === null ? null : Math.max(quiz.maxAttempts - quiz.attempts.length, 0),
        canRetry: !quiz.attempts.some((attempt) => attempt.status === TrainingQuizAttemptStatus.IN_PROGRESS)
          && (quiz.maxAttempts === null || quiz.attempts.length < quiz.maxAttempts),
        latestAttempt: quiz.attempts[0] ? this.mapLearnerAttemptSummary(quiz.attempts[0], quiz) : null,
      })),
      relatedResources: relatedResources.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        resourceType: item.resourceType,
        thumbnailUrl: item.thumbnailUrl,
        fileUrl: item.fileUrl,
        externalUrl: item.externalUrl,
        sizeBytes: item.sizeBytes,
        durationSeconds: item.durationSeconds,
        favorite: item.favorites.length > 0,
        category: item.category,
      })),
      assignment,
      nextAction: assignment?.progress?.nextAction ?? null,
      nextLesson: nextLesson
        ? { id: nextLesson.id, title: nextLesson.title, moduleId: nextLesson.moduleId, sortOrder: nextLesson.sortOrder }
        : null,
    };
  }

  async getCurriculumDetail(tenantId: string, userId: string, curriculumId: string) {
    const curriculum = await this.prisma.trainingCurriculum.findFirst({
      where: {
        id: curriculumId,
        isPublished: true,
        OR: [{ tenantId: null }, { tenantId }],
      },
      include: {
        category: true,
        courses: {
          where: { isPublished: true },
          include: {
            category: true,
            assignments: { where: { tenantId, userId } },
            progressRecords: { where: { tenantId, userId } },
            favorites: { where: { tenantId, userId } },
            certificates: { where: { tenantId, userId } },
          },
          orderBy: { createdAt: 'asc' },
        },
        pathCourses: {
          include: {
            course: {
              include: {
                category: true,
                assignments: { where: { tenantId, userId } },
                progressRecords: { where: { tenantId, userId } },
                favorites: { where: { tenantId, userId } },
                certificates: { where: { tenantId, userId } },
              },
            },
            prerequisiteCourse: {
              select: { id: true, title: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        progressRecords: { where: { tenantId, userId } },
        certificates: { where: { tenantId, userId } },
        assignments: { where: { tenantId, userId } },
        favorites: { where: { tenantId, userId } },
      },
    });

    if (!curriculum) {
      throw new NotFoundException('Training curriculum not found');
    }

    const pathEntries = curriculum.pathCourses.length
      ? curriculum.pathCourses
      : curriculum.courses.map((course, sortOrder) => ({
          id: course.id,
          courseId: course.id,
          course,
          prerequisiteCourseId: null,
          prerequisiteCourse: null,
          sortOrder,
          isRequired: course.isRequired,
          unlockAfterDays: null,
        }));
    const completedCourseIds = new Set(
      pathEntries
        .filter((entry) => entry.course.progressRecords[0]?.status === TrainingProgressStatus.COMPLETED)
        .map((entry) => entry.courseId),
    );
    const curriculumAssignedAt = curriculum.assignments[0]?.startAt
      ?? curriculum.assignments[0]?.createdAt
      ?? null;
    const completedCourses = pathEntries.filter(
      (entry) => entry.course.progressRecords[0]?.status === TrainingProgressStatus.COMPLETED,
    ).length;

    return {
      id: curriculum.id,
      title: curriculum.title,
      description: curriculum.description,
      coverImageUrl: curriculum.coverImageUrl,
      objective: curriculum.objective,
      targetAudience: curriculum.targetAudience,
      estimatedMinutes: curriculum.estimatedMinutes,
      difficulty: curriculum.difficulty,
      favorite: curriculum.favorites.length > 0,
      assigned: curriculum.assignments.length > 0,
      progress: curriculum.progressRecords[0] ?? null,
      certificate: curriculum.certificates[0] ?? null,
      completionSummary: {
        totalCourses: pathEntries.length,
        completedCourses,
        requiredCourses: pathEntries.filter((entry) => entry.isRequired).length,
      },
      courses: pathEntries.map((entry) => {
        const prerequisiteComplete = !entry.prerequisiteCourseId
          || completedCourseIds.has(entry.prerequisiteCourseId);
        const availableAt = entry.unlockAfterDays && curriculumAssignedAt
          ? new Date(curriculumAssignedAt.getTime() + entry.unlockAfterDays * 86_400_000)
          : null;
        const timeUnlocked = !availableAt || availableAt <= new Date();
        return {
          ...this.mapCourseCard(entry.course),
          learningPath: {
            sortOrder: entry.sortOrder,
            isRequired: entry.isRequired,
            prerequisiteCourse: entry.prerequisiteCourse,
            availableAt,
            locked: !prerequisiteComplete || !timeUnlocked,
            lockedReason: !prerequisiteComplete
              ? 'PREREQUISITE_REQUIRED'
              : !timeUnlocked
                ? 'AVAILABLE_LATER'
                : null,
          },
        };
      }),
    };
  }

  async createFavorite(tenantId: string, userId: string, dto: TrainingFavoriteDto) {
    const payload = await this.resolveFavoritePayload(tenantId, dto);
    const existing = await this.prisma.trainingFavorite.findFirst({
      where: { tenantId, userId, ...payload.where },
      select: { id: true },
    });

    if (existing) {
      return { id: existing.id, duplicate: true };
    }

    return this.prisma.trainingFavorite.create({
      data: {
        tenantId,
        userId,
        entityType: dto.entityType,
        ...payload.create,
      },
    });
  }

  async deleteFavorite(tenantId: string, userId: string, dto: TrainingFavoriteDto) {
    const payload = await this.resolveFavoritePayload(tenantId, dto);
    await this.prisma.trainingFavorite.deleteMany({
      where: { tenantId, userId, ...payload.where },
    });
    return { deleted: true };
  }

  async updateCourseProgress(
    tenantId: string,
    userId: string,
    courseId: string,
    dto: UpdateTrainingCourseProgressDto,
    requestId?: string,
  ) {
    await this.assertCourseVisible(tenantId, courseId);
    await this.assertLearningPathCourseUnlocked(tenantId, userId, courseId);

    const progressPercent = dto.progressPercent ?? 0;
    const status =
      dto.status ??
      (dto.completedAt || progressPercent >= 100
        ? TrainingProgressStatus.COMPLETED
        : progressPercent > 0 || dto.startedAt
          ? TrainingProgressStatus.IN_PROGRESS
          : TrainingProgressStatus.NOT_STARTED);

    if (requestId) {
      const previous = await this.prisma.trainingProgress.findUnique({
        where: { tenantId_userId_courseId: { tenantId, userId, courseId } },
      });
      if (previous?.lastRequestId === requestId) return previous;
    }

    const progress = await this.prisma.trainingProgress.upsert({
      where: {
        tenantId_userId_courseId: {
          tenantId,
          userId,
          courseId,
        },
      },
      update: {
        progressPercent,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        lastActivityAt: new Date(),
        lastRequestId: requestId,
        status,
      },
      create: {
        tenantId,
        userId,
        courseId,
        progressPercent,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : progressPercent > 0 ? new Date() : null,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        lastActivityAt: new Date(),
        lastRequestId: requestId,
        status,
      },
    });

    await this.syncAssignmentFromCourseProgress(tenantId, userId, courseId, progress);
    await this.syncCurriculumFromCourse(tenantId, userId, courseId);
    if (status === TrainingProgressStatus.COMPLETED) {
      await this.ensureCertificate(tenantId, userId, { courseId });
      await this.webhooks.publish(tenantId, 'course.completed', {
        courseId,
        userId,
        progressPercent: progress.progressPercent,
        completedAt: progress.completedAt?.toISOString() ?? new Date().toISOString(),
      }, `course-completed-${tenantId}-${userId}-${courseId}`);
    }
    await this.syncAnalyticsSnapshot(tenantId, userId);
    return progress;
  }

  private async assertLearningPathCourseUnlocked(
    tenantId: string,
    userId: string,
    courseId: string,
  ) {
    const entries = await this.prisma.trainingPathCourse.findMany({
      where: {
        tenantId,
        courseId,
        curriculum: {
          assignments: { some: { tenantId, userId } },
        },
      },
      include: {
        curriculum: {
          include: {
            assignments: {
              where: { tenantId, userId },
              select: { startAt: true, createdAt: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!entries.length) return;
    const prerequisiteIds = entries
      .map((entry) => entry.prerequisiteCourseId)
      .filter((id): id is string => Boolean(id));
    const completed = prerequisiteIds.length
      ? await this.prisma.trainingProgress.findMany({
          where: {
            tenantId,
            userId,
            courseId: { in: prerequisiteIds },
            status: TrainingProgressStatus.COMPLETED,
          },
          select: { courseId: true },
        })
      : [];
    const completedIds = new Set(completed.map((item) => item.courseId));
    const now = new Date();
    const unlocked = entries.some((entry) => {
      if (entry.prerequisiteCourseId && !completedIds.has(entry.prerequisiteCourseId)) {
        return false;
      }
      const assignment = entry.curriculum.assignments[0];
      if (!entry.unlockAfterDays || !assignment) return true;
      const assignedAt = assignment.startAt ?? assignment.createdAt;
      return assignedAt.getTime() + entry.unlockAfterDays * 86_400_000 <= now.getTime();
    });
    if (!unlocked) {
      throw new ForbiddenException(
        'Complete the prerequisite or wait until this learning-path course becomes available',
      );
    }
  }

  async updateStepProgress(
    tenantId: string,
    userId: string,
    stepId: string,
    dto: UpdateTrainingStepProgressDto,
  ) {
    const step = await this.prisma.trainingCourseStep.findUnique({
      where: { id: stepId },
      include: { course: true },
    });

    if (!step || (step.course.tenantId !== null && step.course.tenantId !== tenantId)) {
      throw new NotFoundException('Training step not found');
    }

    const record = await this.prisma.trainingStepProgress.upsert({
      where: {
        userId_courseStepId: {
          userId,
          courseStepId: stepId,
        },
      },
      update: {
        isCompleted: dto.isCompleted,
        completedAt: dto.completedAt
          ? new Date(dto.completedAt)
          : dto.isCompleted
            ? new Date()
            : null,
        score: dto.score,
        timeSpentSeconds: dto.timeSpentSeconds,
      },
      create: {
        tenantId,
        userId,
        courseStepId: stepId,
        isCompleted: dto.isCompleted,
        completedAt: dto.completedAt
          ? new Date(dto.completedAt)
          : dto.isCompleted
            ? new Date()
            : null,
        score: dto.score,
        timeSpentSeconds: dto.timeSpentSeconds,
      },
    });

    await this.syncCourseProgressFromSteps(tenantId, userId, step.courseId);
    await this.syncAnalyticsSnapshot(tenantId, userId);
    return record;
  }

  async updateLessonProgress(
    tenantId: string,
    userId: string,
    lessonId: string,
    dto: UpdateTrainingLessonProgressDto,
    requestId?: string,
  ) {
    const lesson = await this.prisma.trainingLesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (
      !lesson ||
      (lesson.module.course.tenantId !== null && lesson.module.course.tenantId !== tenantId) ||
      !lesson.module.course.isPublished
    ) {
      throw new NotFoundException('Training lesson not found');
    }

    const now = new Date();
    if (requestId) {
      const previous = await this.prisma.trainingLessonProgress.findFirst({
        where: { tenantId, userId, lastRequestId: requestId },
      });
      if (previous) return previous;
    }
    const record = await this.prisma.trainingLessonProgress.upsert({
      where: { tenantId_userId_lessonId: { tenantId, userId, lessonId } },
      update: {
        isCompleted: dto.completed,
        startedAt: now,
        lastOpenedAt: now,
        completedAt: dto.completed ? now : null,
        ...(requestId ? { lastRequestId: requestId } : {}),
      },
      create: {
        tenantId,
        userId,
        lessonId,
        isCompleted: dto.completed,
        startedAt: now,
        lastOpenedAt: now,
        completedAt: dto.completed ? now : null,
        ...(requestId ? { lastRequestId: requestId } : {}),
      },
    });

    await this.syncCourseProgressFromLessons(
      tenantId,
      userId,
      lesson.module.courseId,
    );
    await this.syncAnalyticsSnapshot(tenantId, userId);
    return record;
  }

  async createQuizAttempt(tenantId: string, userId: string, quizId: string) {
    const quiz = await this.prisma.trainingQuiz.findUnique({
      where: { id: quizId },
      include: {
        course: true,
        questions: {
          include: { options: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        attempts: {
          where: { tenantId, userId },
        },
      },
    });

    if (!quiz || (quiz.course.tenantId !== null && quiz.course.tenantId !== tenantId)) {
      throw new NotFoundException('Training quiz not found');
    }

    const now = new Date();
    if (quiz.availableFrom && quiz.availableFrom > now) {
      throw new ForbiddenException('This assessment is not available yet');
    }
    if (quiz.availableUntil && quiz.availableUntil < now) {
      throw new ForbiddenException('This assessment is no longer available');
    }
    if (quiz.attempts.some((item) => item.status === TrainingQuizAttemptStatus.IN_PROGRESS)) {
      throw new ForbiddenException('An assessment attempt is already in progress');
    }

    if (quiz.maxAttempts !== null && quiz.attempts.length >= quiz.maxAttempts) {
      throw new ForbiddenException('Max attempts reached for this quiz');
    }

    const latestAttempt = [...quiz.attempts].sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    )[0];
    if (
      quiz.cooldownMinutes &&
      latestAttempt &&
      (latestAttempt.submittedAt ?? latestAttempt.startedAt).getTime() + quiz.cooldownMinutes * 60_000 > now.getTime()
    ) {
      throw new ForbiddenException('The retry cooldown for this assessment is still active');
    }

    const orderedQuestions = quiz.shuffleQuestions
      ? [...quiz.questions].sort(() => Math.random() - 0.5)
      : quiz.questions;
    const questions = quiz.randomQuestionCount
      ? orderedQuestions.slice(0, quiz.randomQuestionCount)
      : orderedQuestions;
    if (questions.length === 0) {
      throw new ForbiddenException('This assessment has no available questions');
    }

    const attempt = await this.prisma.trainingQuizAttempt.create({
      data: {
        tenantId,
        userId,
        quizId,
        startedAt: new Date(),
        expiresAt: quiz.timeLimitMinutes
          ? new Date(Date.now() + quiz.timeLimitMinutes * 60_000)
          : null,
        questionIds: questions.map((question) => question.id),
      },
    });
    return {
      ...attempt,
      quiz: {
        id: quiz.id,
        courseId: quiz.courseId,
        title: quiz.title,
        description: quiz.description,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        timeLimitMinutes: quiz.timeLimitMinutes,
          shuffleQuestions: quiz.shuffleQuestions,
          shuffleOptions: quiz.shuffleOptions,
          requireAllQuestions: quiz.requireAllQuestions,
          questions: questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          questionType: question.questionType,
          points: question.points,
          options: (quiz.shuffleOptions ? [...question.options].sort(() => Math.random() - 0.5) : question.options).map((option) => ({
            id: option.id,
            label: option.label,
          })),
        })),
      },
    };
  }

  async getQuizAttempt(tenantId: string, userId: string, quizId: string, attemptId: string) {
    const attempt = await this.prisma.trainingQuizAttempt.findFirst({
      where: { id: attemptId, tenantId, userId, quizId },
      include: {
        answers: { select: { questionId: true, optionId: true, selectedOptionIds: true, textAnswer: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Training quiz attempt not found');

    const questions = await this.prisma.trainingQuizQuestion.findMany({
      where: { quizId, id: { in: attempt.questionIds } },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    const now = new Date();
    const timeRemainingSeconds = attempt.expiresAt
      ? Math.max(0, Math.floor((attempt.expiresAt.getTime() - now.getTime()) / 1000))
      : null;

    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      expiresAt: attempt.expiresAt,
      timeRemainingSeconds,
      questionCount: questions.length,
      answers: attempt.answers,
      questions: questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        questionType: question.questionType,
        points: question.points,
        options: question.options.map((option) => ({ id: option.id, label: option.label })),
      })),
    };
  }

  async answerQuizAttempt(
    tenantId: string,
    userId: string,
    quizId: string,
    attemptId: string,
    dto: CreateTrainingQuizAttemptAnswerDto,
  ) {
    const attempt = await this.prisma.trainingQuizAttempt.findFirst({
      where: { id: attemptId, tenantId, userId, quizId },
      include: {
        quiz: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Training quiz attempt not found');
    }

    const question = attempt.quiz.questions.find((item) => item.id === dto.questionId);
    if (!question || (attempt.questionIds.length > 0 && !attempt.questionIds.includes(question.id))) {
      throw new NotFoundException('Training quiz question not found');
    }

    if (attempt.status !== TrainingQuizAttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException('This assessment attempt is no longer editable');
    }
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      throw new ForbiddenException('This assessment attempt has expired');
    }
    const selectedOptionIds = dto.selectedOptionIds?.length
      ? dto.selectedOptionIds
      : dto.optionId
        ? [dto.optionId]
        : [];
    const correctIds = question.options.filter((item) => item.isCorrect).map((item) => item.id).sort();
    const selectedIds = [...selectedOptionIds].sort();
    const isCorrect =
      question.questionType === TrainingQuizQuestionType.TEXT
        ? null
        : correctIds.length === selectedIds.length &&
          correctIds.every((id, index) => id === selectedIds[index]);
    const awardedPoints = isCorrect ? question.points : isCorrect === false ? 0 : null;

    return this.prisma.trainingQuizAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId: dto.questionId,
        },
      },
      update: {
        optionId: dto.optionId,
        selectedOptionIds,
        textAnswer: dto.textAnswer,
        isCorrect,
        awardedPoints,
      },
      create: {
        attemptId,
        questionId: dto.questionId,
        optionId: dto.optionId,
        selectedOptionIds,
        textAnswer: dto.textAnswer,
        isCorrect,
        awardedPoints,
      },
    });
  }

  async submitQuizAttempt(
    tenantId: string,
    userId: string,
    quizId: string,
    attemptId: string,
    _dto: SubmitTrainingQuizAttemptDto,
    requestId?: string,
  ) {
    const attempt = await this.prisma.trainingQuizAttempt.findFirst({
      where: { id: attemptId, tenantId, userId, quizId },
      include: {
        answers: true,
        quiz: {
          include: {
            questions: true,
            course: {
              include: {
                steps: {
                  where: { stepType: TrainingCourseStepType.QUIZ },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Training quiz attempt not found');
    }

    if (requestId && attempt.submissionRequestId === requestId) return attempt;

    if (attempt.status !== TrainingQuizAttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException('This assessment attempt was already submitted');
    }
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      throw new ForbiddenException('This assessment attempt has expired');
    }
    const selectedQuestions = attempt.questionIds.length
      ? attempt.quiz.questions.filter((question) => attempt.questionIds.includes(question.id))
      : attempt.quiz.questions;
    const unanswered = selectedQuestions.filter(
      (question) => !attempt.answers.some((answer) => answer.questionId === question.id),
    );
    if (attempt.quiz.requireAllQuestions && unanswered.length > 0) {
      throw new ForbiddenException('Answer every question before submitting the assessment');
    }
    if (attempt.answers.length === 0) {
      throw new ForbiddenException('Answer at least one question before submitting the assessment');
    }
    const requiresManualReview = selectedQuestions.some(
      (question) => question.requiresManualGrading,
    );
    const totalPoints = selectedQuestions.reduce((sum, question) => sum + question.points, 0);
    const earnedPoints = attempt.answers.reduce(
      (sum, answer) => sum + (answer.awardedPoints ?? 0),
      0,
    );
    const score = totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);
    const passed = score >= attempt.quiz.passingScore;

    const submittedAt = new Date();
    const nextStatus = requiresManualReview
      ? TrainingQuizAttemptStatus.PENDING_REVIEW
      : TrainingQuizAttemptStatus.GRADED;
    const claim = await this.prisma.trainingQuizAttempt.updateMany({
      where: { id: attemptId, tenantId, userId, quizId, status: TrainingQuizAttemptStatus.IN_PROGRESS },
      data: {
        submittedAt,
        submissionRequestId: requestId,
        score: requiresManualReview ? null : score,
        passed: requiresManualReview ? null : passed,
        status: nextStatus,
      },
    });
    if (!claim.count) {
      const current = await this.prisma.trainingQuizAttempt.findFirst({ where: { id: attemptId, tenantId, userId, quizId } });
      if (requestId && current?.submissionRequestId === requestId) return current;
      throw new ForbiddenException('This assessment attempt was already submitted');
    }
    const updated = await this.prisma.trainingQuizAttempt.findFirstOrThrow({ where: { id: attemptId, tenantId, userId, quizId } });

    if (!requiresManualReview && passed && attempt.quiz.course.steps[0]) {
      const quizStep = attempt.quiz.course.steps[0];
      await this.prisma.trainingStepProgress.upsert({
        where: {
          userId_courseStepId: {
            userId,
            courseStepId: quizStep.id,
          },
        },
        update: {
          isCompleted: true,
          completedAt: new Date(),
          score,
        },
        create: {
          tenantId,
          userId,
          courseStepId: quizStep.id,
          isCompleted: true,
          completedAt: new Date(),
          score,
        },
      });
      await this.syncCourseProgressFromSteps(tenantId, userId, attempt.quiz.course.id);
      await this.syncAnalyticsSnapshot(tenantId, userId);
    }

    return updated;
  }

  async listCertificates(tenantId: string, userId: string) {
    const items = await this.prisma.trainingCertificate.findMany({
      where: { tenantId, userId },
      include: {
        course: true,
        curriculum: true,
        renewedFrom: { select: { id: true, certificateNumber: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        certificateNumber: item.certificateNumber,
        certificateUrl: item.certificateUrl,
        issuedAt: item.issuedAt,
        expiresAt: item.expiresAt,
        verificationCode: item.verificationCode,
        issuedReason: item.issuedReason,
        policyVersion: item.policyVersion,
        evidenceSnapshot: item.evidenceSnapshot,
        supersededAt: item.supersededAt,
        renewedFrom: item.renewedFrom,
        status: item.revokedAt
          ? 'REVOKED'
          : item.supersededAt
            ? 'RENEWED'
          : item.expiresAt && item.expiresAt < new Date()
            ? 'EXPIRED'
            : 'VALID',
        course: item.course ? { id: item.course.id, title: item.course.title } : null,
        curriculum: item.curriculum ? { id: item.curriculum.id, title: item.curriculum.title } : null,
      })),
    };
  }

  async listMyPilots(tenantId: string, userId: string) {
    const items = await this.prisma.trainingCoursePilot.findMany({
      where: {
        tenantId,
        participantIds: { has: userId },
        status: TrainingPilotStatus.ACTIVE,
      },
      include: {
        course: { select: { id: true, title: true, summary: true, coverImageUrl: true } },
        feedback: { where: { userId }, select: { id: true, rating: true, comment: true } },
      },
      orderBy: { activatedAt: 'desc' },
    });
    return { items };
  }

  async submitPilotFeedback(
    tenantId: string,
    userId: string,
    pilotId: string,
    dto: SubmitTrainingPilotFeedbackDto,
  ) {
    const pilot = await this.prisma.trainingCoursePilot.findFirst({
      where: {
        id: pilotId,
        tenantId,
        status: TrainingPilotStatus.ACTIVE,
        participantIds: { has: userId },
      },
    });
    if (!pilot) throw new NotFoundException('Active course pilot not found');
    return this.prisma.trainingPilotFeedback.upsert({
      where: { pilotId_userId: { pilotId, userId } },
      update: dto,
      create: { pilotId, userId, ...dto },
    });
  }

  private async findAssignments(
    tenantId: string,
    userId: string,
    query?: ListTrainingAssignmentsDto,
  ) {
    const now = new Date();
    const where: Prisma.TrainingAssignmentWhereInput = {
      tenantId,
      userId,
      ...(query?.status && query.status !== TrainingProgressStatus.OVERDUE ? { status: query.status } : {}),
      ...(query?.type ? { assignmentType: query.type } : {}),
      ...(query?.search
        ? {
            OR: [
              { course: { title: { contains: query.search, mode: 'insensitive' } } },
              { curriculum: { title: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.trainingAssignment.findMany({
      where,
      include: {
        course: {
          include: {
            category: true,
            favorites: { where: { tenantId, userId } },
          },
        },
        curriculum: {
          include: {
            category: true,
            favorites: { where: { tenantId, userId } },
          },
        },
      },
      orderBy:
        query?.sort === 'progress'
          ? [{ progressPercent: query.order === 'asc' ? 'asc' : 'desc' }, { updatedAt: 'desc' }]
          : query?.sort === 'title'
            ? [{ createdAt: 'desc' }]
            : [{ dueAt: query?.order === 'asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }],
    });

    return items
      .map((item) => this.mapAssignmentRecord(item, item.course, item.curriculum))
      .filter((item) => {
        if (query?.status === TrainingProgressStatus.OVERDUE) {
          return item.status === TrainingProgressStatus.OVERDUE;
        }
        if (query?.status) {
          return item.status === query.status;
        }
        return true;
      })
      .map((item) => ({
        ...item,
        overdue: Boolean(item.dueAt && new Date(item.dueAt) < now && item.status !== TrainingProgressStatus.COMPLETED),
      }));
  }

  private async findPendingAssessments(tenantId: string, userId: string, assignments: any[]) {
    const courseIds = [...new Set(assignments
      .filter((assignment) => assignment.status !== TrainingProgressStatus.COMPLETED && assignment.courseId)
      .map((assignment) => assignment.courseId))];
    const quizDelegate = (this.prisma as any)?.trainingQuiz;
    if (!courseIds.length || !quizDelegate?.findMany) return [];

    const quizzes = await quizDelegate.findMany({
      where: { courseId: { in: courseIds }, course: { OR: [{ tenantId: null }, { tenantId }] } },
      select: {
        id: true,
        courseId: true,
        title: true,
        description: true,
        maxAttempts: true,
        attempts: {
          where: { tenantId, userId },
          orderBy: { createdAt: 'desc' },
          select: { status: true, passed: true, score: true, createdAt: true },
        },
        course: { select: { id: true, title: true } },
      },
    });

    return quizzes
      .map((quiz: any) => {
        const assignment = assignments.find((item) => item.courseId === quiz.courseId);
        const latestAttempt = quiz.attempts[0] ?? null;
        const passed = quiz.attempts.some((attempt: any) => attempt.passed === true);
        const inProgress = latestAttempt?.status === TrainingQuizAttemptStatus.IN_PROGRESS;
        const attemptsRemaining = quiz.maxAttempts === null
          ? null
          : Math.max(quiz.maxAttempts - quiz.attempts.length, 0);
        return {
          id: quiz.id,
          quizId: quiz.id,
          assignmentId: assignment?.id ?? null,
          courseId: quiz.courseId,
          courseTitle: quiz.course?.title ?? null,
          title: quiz.title,
          description: quiz.description,
          status: inProgress ? 'IN_PROGRESS' : 'PENDING',
          attemptsUsed: quiz.attempts.length,
          attemptsRemaining,
          canStart: !passed && !inProgress && (attemptsRemaining === null || attemptsRemaining > 0),
          latestAttempt: latestAttempt
            ? { status: latestAttempt.status, score: latestAttempt.score, createdAt: latestAttempt.createdAt }
            : null,
        };
      })
      .filter((assessment: any) => assessment.canStart || assessment.status === 'IN_PROGRESS');
  }

  private async findUpcomingEvents(tenantId: string, userId: string) {
    const attendances = await this.prisma.trainingEventAttendance.findMany({
      where: {
        userId,
        event: {
          tenantId,
          startsAt: { gte: new Date() },
        },
      },
      include: { event: true },
      orderBy: { event: { startsAt: 'asc' } },
      take: 6,
    });

    return attendances.map((attendance) => this.mapEvent(attendance.event, attendance.status));
  }

  private async syncCourseProgressFromSteps(tenantId: string, userId: string, courseId: string) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        steps: {
          include: {
            progressRecords: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!course) {
      return;
    }

    const requiredSteps = course.steps.filter((step) => step.isRequired);
    const completedSteps = requiredSteps.filter((step) => step.progressRecords[0]?.isCompleted);
    const progressPercent =
      requiredSteps.length === 0 ? 100 : Math.round((completedSteps.length / requiredSteps.length) * 100);
    const status =
      progressPercent >= 100
        ? TrainingProgressStatus.COMPLETED
        : progressPercent > 0
          ? TrainingProgressStatus.IN_PROGRESS
          : TrainingProgressStatus.NOT_STARTED;

    const progress = await this.prisma.trainingProgress.upsert({
      where: {
        tenantId_userId_courseId: {
          tenantId,
          userId,
          courseId,
        },
      },
      update: {
        progressPercent,
        lastActivityAt: new Date(),
        completedAt: status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        status,
      },
      create: {
        tenantId,
        userId,
        courseId,
        progressPercent,
        startedAt: progressPercent > 0 ? new Date() : null,
        lastActivityAt: new Date(),
        completedAt: status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        status,
      },
    });

    await this.syncAssignmentFromCourseProgress(tenantId, userId, courseId, progress);
    await this.syncCurriculumFromCourse(tenantId, userId, courseId);
    if (status === TrainingProgressStatus.COMPLETED) {
      await this.ensureCertificate(tenantId, userId, { courseId });
    }
  }

  private async syncCourseProgressFromLessons(
    tenantId: string,
    userId: string,
    courseId: string,
  ) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          include: {
            lessons: {
              include: {
                progressRecords: { where: { tenantId, userId } },
              },
            },
          },
        },
      },
    });
    if (!course || (course.tenantId !== null && course.tenantId !== tenantId)) return;

    const requiredLessons = course.modules
      .filter((module) => module.isRequired)
      .flatMap((module) => module.lessons)
      .filter((lesson) => lesson.isRequired);
    const completed = requiredLessons.filter(
      (lesson) => lesson.progressRecords[0]?.isCompleted,
    ).length;
    const progressPercent =
      requiredLessons.length === 0
        ? 100
        : Math.round((completed / requiredLessons.length) * 100);
    const status =
      progressPercent >= 100
        ? TrainingProgressStatus.COMPLETED
        : progressPercent > 0
          ? TrainingProgressStatus.IN_PROGRESS
          : TrainingProgressStatus.NOT_STARTED;
    const now = new Date();
    const progress = await this.prisma.trainingProgress.upsert({
      where: { tenantId_userId_courseId: { tenantId, userId, courseId } },
      update: {
        progressPercent,
        status,
        startedAt: progressPercent > 0 ? now : undefined,
        lastActivityAt: now,
        completedAt: status === TrainingProgressStatus.COMPLETED ? now : null,
      },
      create: {
        tenantId,
        userId,
        courseId,
        progressPercent,
        status,
        startedAt: progressPercent > 0 ? now : null,
        lastActivityAt: now,
        completedAt: status === TrainingProgressStatus.COMPLETED ? now : null,
      },
    });
    await this.syncAssignmentFromCourseProgress(tenantId, userId, courseId, progress);
    await this.syncCurriculumFromCourse(tenantId, userId, courseId);
    if (status === TrainingProgressStatus.COMPLETED) {
      await this.ensureCertificate(tenantId, userId, { courseId });
    }
  }

  private async syncCurriculumFromCourse(tenantId: string, userId: string, courseId: string) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      select: { curriculumId: true },
    });

    if (!course?.curriculumId) {
      return;
    }

    const curriculum = await this.prisma.trainingCurriculum.findUnique({
      where: { id: course.curriculumId },
      include: {
        courses: {
          where: { isPublished: true, isRequired: true },
          include: {
            progressRecords: {
              where: { tenantId, userId },
            },
          },
        },
      },
    });

    if (!curriculum) {
      return;
    }

    const total = curriculum.courses.length;
    const completed = curriculum.courses.filter(
      (item) => item.progressRecords[0]?.status === TrainingProgressStatus.COMPLETED,
    ).length;
    const progressPercent = total === 0 ? 100 : Math.round((completed / total) * 100);
    const status =
      progressPercent >= 100
        ? TrainingProgressStatus.COMPLETED
        : progressPercent > 0
          ? TrainingProgressStatus.IN_PROGRESS
          : TrainingProgressStatus.NOT_STARTED;

    await this.prisma.trainingProgress.upsert({
      where: {
        tenantId_userId_curriculumId: {
          tenantId,
          userId,
          curriculumId: curriculum.id,
        },
      },
      update: {
        progressPercent,
        lastActivityAt: new Date(),
        completedAt: status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        status,
      },
      create: {
        tenantId,
        userId,
        curriculumId: curriculum.id,
        progressPercent,
        startedAt: progressPercent > 0 ? new Date() : null,
        lastActivityAt: new Date(),
        completedAt: status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        status,
      },
    });

    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { tenantId, userId, curriculumId: curriculum.id },
      select: { id: true },
    });

    if (assignment) {
      await this.prisma.trainingAssignment.update({
        where: { id: assignment.id },
        data: {
          progressPercent,
          status,
          completedAt: status === TrainingProgressStatus.COMPLETED ? new Date() : null,
        },
      });
    }

    if (status === TrainingProgressStatus.COMPLETED) {
      await this.ensureCertificate(tenantId, userId, { curriculumId: curriculum.id });
    }
  }

  private async syncAssignmentFromCourseProgress(
    tenantId: string,
    userId: string,
    courseId: string,
    progress: { progressPercent: number; status: TrainingProgressStatus; completedAt: Date | null },
  ) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { tenantId, userId, courseId },
      select: { id: true },
    });

    if (!assignment) {
      return;
    }

    await this.prisma.trainingAssignment.update({
      where: { id: assignment.id },
      data: {
        progressPercent: progress.progressPercent,
        status: progress.status,
        completedAt: progress.completedAt,
      },
    });
  }

  private async syncAnalyticsSnapshot(tenantId: string, userId: string) {
    const [progress, assignments, certificates] = await Promise.all([
      this.prisma.trainingProgress.findMany({
        where: { tenantId, userId, courseId: { not: null } },
        include: { course: true },
      }),
      this.prisma.trainingAssignment.findMany({
        where: { tenantId, userId },
      }),
      this.prisma.trainingCertificate.count({ where: { tenantId, userId } }),
    ]);

    const totalCourses = progress.length;
    const completedCourses = progress.filter((item) => item.status === TrainingProgressStatus.COMPLETED).length;
    const totalMinutes = progress.reduce((sum, item) => sum + (item.course?.estimatedMinutes ?? 0), 0);
    const overdueCourses = assignments.filter(
      (item) => Boolean(item.dueAt && item.dueAt < new Date() && item.status !== TrainingProgressStatus.COMPLETED),
    ).length;
    const completionRate = totalCourses === 0 ? 0 : Number(((completedCourses / totalCourses) * 100).toFixed(2));

    const existing = await this.prisma.trainingAnalyticsSnapshot.findFirst({
      where: { tenantId, userId },
      orderBy: { generatedAt: 'desc' },
      select: { id: true },
    });

    const data = {
      totalMinutes,
      totalCourses,
      completedCourses,
      completionRate: new Prisma.Decimal(completionRate),
      overdueCourses,
      certificatesEarned: certificates,
      generatedAt: new Date(),
    };

    return existing
      ? this.prisma.trainingAnalyticsSnapshot.update({
          where: { id: existing.id },
          data,
        })
      : this.prisma.trainingAnalyticsSnapshot.create({
          data: {
            tenantId,
            userId,
            ...data,
          },
        });
  }

  private async ensureCertificate(
    tenantId: string,
    userId: string,
    target: { courseId?: string; curriculumId?: string },
  ) {
    let policy: any = null;
    let evidence: Prisma.InputJsonValue = { source: 'CURRICULUM_COMPLETION' };
    if (target.courseId) {
      const course = await this.prisma.trainingCourse.findFirst({
        where: { id: target.courseId, OR: [{ tenantId }, { tenantId: null }] },
        include: {
          certificationPolicy: true,
          quizzes: { select: { id: true } },
          modules: {
            include: {
              lessons: {
                include: { progressRecords: { where: { tenantId, userId } } },
              },
            },
          },
        },
      });
      policy = course?.certificationPolicy;
      if (!course || !policy?.isEnabled || !policy.autoIssue) return;

      const requiredLessons = course.modules
        .filter((module) => module.isRequired)
        .flatMap((module) => module.lessons.filter((lesson) => lesson.isRequired));
      const incompleteLessons = requiredLessons.filter(
        (lesson) => !lesson.progressRecords[0]?.isCompleted,
      );
      if (policy.requireAllRequiredLessons && incompleteLessons.length > 0) return;

      const attempts = course.quizzes.length
        ? await this.prisma.trainingQuizAttempt.findMany({
            where: {
              tenantId,
              userId,
              quizId: { in: course.quizzes.map((quiz) => quiz.id) },
              status: TrainingQuizAttemptStatus.GRADED,
              passed: true,
            },
            orderBy: { gradedAt: 'desc' },
          })
        : [];
      const passedQuizIds = new Set(attempts.map((attempt) => attempt.quizId));
      if (
        policy.requireAssessment &&
        (course.quizzes.length === 0 || course.quizzes.some((quiz) => !passedQuizIds.has(quiz.id)))
      ) return;

      evidence = {
        source: 'COURSE_COMPLETION',
        courseId: course.id,
        policyVersion: policy.version,
        completedLessonIds: requiredLessons.map((lesson) => lesson.id),
        assessmentAttempts: attempts.map((attempt) => ({
          id: attempt.id,
          quizId: attempt.quizId,
          score: attempt.score,
          gradedAt: attempt.gradedAt?.toISOString(),
        })),
      } as Prisma.InputJsonValue;
    }

    const existing = await this.prisma.trainingCertificate.findFirst({
      where: {
        tenantId,
        userId,
        ...(target.courseId ? { courseId: target.courseId } : {}),
        ...(target.curriculumId ? { curriculumId: target.curriculumId } : {}),
        revokedAt: null,
        supersededAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    const now = new Date();
    const verificationCode = randomBytes(6).toString('hex').toUpperCase();
    const certificate = await this.prisma.trainingCertificate.create({
      data: {
        tenantId,
        userId,
        courseId: target.courseId,
        curriculumId: target.curriculumId,
        policyId: policy?.id,
        policyVersion: policy?.version,
        verificationCode,
        certificateNumber: `CERT-${now.getUTCFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`,
        certificateUrl: `/certificates/verify/${verificationCode}`,
        issuedAt: now,
        expiresAt: policy?.validityDays
          ? new Date(now.getTime() + policy.validityDays * 86_400_000)
          : null,
        issuedReason: 'COMPLETION',
        evidenceSnapshot: evidence,
      },
    });
    await this.webhooks.publish(tenantId, 'certificate.issued', {
      certificateId: certificate.id,
      userId,
      courseId: target.courseId,
      curriculumId: target.curriculumId,
      verificationCode,
    }, `certificate-issued-${certificate.id}`);
  }

  private mapAssignmentRecord(assignment: any, course?: any, curriculum?: any) {
    const baseCategory = course?.category ?? curriculum?.category ?? null;
    const progress = this.progressResolver.resolve(assignment, course, curriculum);

    return {
      id: assignment.id,
      courseId: assignment.courseId,
      curriculumId: assignment.curriculumId,
      title: course?.title ?? curriculum?.title ?? 'Asignacion',
      description: course?.summary ?? curriculum?.description ?? null,
      summary: course?.summary ?? curriculum?.description ?? null,
      coverImageUrl: course?.coverImageUrl ?? curriculum?.coverImageUrl ?? null,
      type: assignment.assignmentType,
      progressPercent: assignment.progressPercent,
      status: progress.status,
      dueAt: assignment.dueAt,
      isRequired: Boolean(assignment.isRequired),
      completedAt: assignment.completedAt,
      estimatedMinutes: course?.estimatedMinutes ?? curriculum?.estimatedMinutes ?? 0,
      category: baseCategory,
      favorite: Boolean(course?.favorites?.length ?? curriculum?.favorites?.length),
      assigned: true,
      tags: course?.tags ?? [],
      certificateEligible: true,
      displayStatus: progress.displayStatus,
      progress,
      nextAction: progress.nextAction,
    };
  }

  private mapCourseCard(course: any) {
    return {
      id: course.id,
      title: course.title,
      description: course.description ?? course.summary,
      summary: course.summary,
      coverImageUrl: course.coverImageUrl,
      type: course.type,
      progressPercent: course.progressRecords?.[0]?.progressPercent ?? 0,
      status: course.progressRecords?.[0]?.status ?? TrainingProgressStatus.NOT_STARTED,
      dueAt: null,
      completedAt: course.progressRecords?.[0]?.completedAt ?? null,
      estimatedMinutes: course.estimatedMinutes,
      category: course.category,
      favorite: course.favorites?.length > 0,
      assigned: course.assignments?.length > 0,
      tags: course.tags ?? [],
      certificateEligible: true,
    };
  }

  private mapLearnerAttemptSummary(attempt: any, quiz: any) {
    const feedbackAvailable = quiz.feedbackMode === 'AFTER_SUBMISSION'
      || (quiz.feedbackMode === 'AFTER_PASSING' && attempt.passed === true);

    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      expiresAt: attempt.expiresAt,
      score: attempt.score,
      passed: attempt.passed,
      gradedAt: attempt.gradedAt,
      feedback: feedbackAvailable ? attempt.feedback ?? null : null,
    };
  }

  private mapEvent(event: any, attendanceStatus: TrainingEventAttendanceStatus) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      modality: event.modality,
      attendanceStatus,
    };
  }

  private async resolveFavoritePayload(tenantId: string, dto: TrainingFavoriteDto) {
    if (dto.entityType === TrainingFavoriteEntityType.COURSE) {
      await this.assertCourseVisible(tenantId, dto.entityId);
      return {
        create: { courseId: dto.entityId },
        where: { courseId: dto.entityId },
      };
    }

    if (dto.entityType === TrainingFavoriteEntityType.CURRICULUM) {
      const curriculum = await this.prisma.trainingCurriculum.findFirst({
        where: { id: dto.entityId, OR: [{ tenantId: null }, { tenantId }] },
        select: { id: true },
      });
      if (!curriculum) {
        throw new NotFoundException('Training curriculum not found');
      }
      return {
        create: { curriculumId: dto.entityId },
        where: { curriculumId: dto.entityId },
      };
    }

    const resource = await this.prisma.trainingLibraryResource.findFirst({
      where: { id: dto.entityId, OR: [{ tenantId: null }, { tenantId }] },
      select: { id: true },
    });
    if (!resource) {
      throw new NotFoundException('Training resource not found');
    }
    return {
      create: { libraryResourceId: dto.entityId },
      where: { libraryResourceId: dto.entityId },
    };
  }

  private async assertCourseVisible(tenantId: string, courseId: string) {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, OR: [{ tenantId: null }, { tenantId }] },
      select: { id: true },
    });
    if (!course) {
      throw new NotFoundException('Training course not found');
    }
  }

  private async persistModuleAccess(
    tenantId: string,
    subscriptionId: string | null,
    planId: string | null,
    enabled: boolean,
  ) {
    await this.prisma.tenantTrainingModuleAccess.upsert({
      where: { tenantId },
      update: {
        subscriptionId,
        planId,
        enabled,
        enabledAt: enabled ? new Date() : null,
        disabledAt: enabled ? null : new Date(),
      },
      create: {
        tenantId,
        subscriptionId,
        planId,
        enabled,
        enabledAt: enabled ? new Date() : null,
        disabledAt: enabled ? null : new Date(),
      },
    });
  }
}
