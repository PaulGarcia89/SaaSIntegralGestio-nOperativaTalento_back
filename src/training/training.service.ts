import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ModuleCode,
  Prisma,
  TrainingCourseStepType,
  TrainingEventAttendanceStatus,
  TrainingFavoriteEntityType,
  TrainingProgressStatus,
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

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

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

    const overdueAssignments = assignments.filter((item) => item.status === TrainingProgressStatus.OVERDUE);
    const inProgressAssignments = assignments.filter(
      (item) => item.status === TrainingProgressStatus.IN_PROGRESS,
    );
    const completedAssignments = assignments.filter(
      (item) => item.status === TrainingProgressStatus.COMPLETED,
    );

    return {
      overdueAssignments,
      inProgressAssignments,
      completedAssignments,
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
    const items = await this.findAssignments(tenantId, userId, query);
    const pagination = normalizeOffsetPagination(query);
    const start = pagination.skip;
    const end = start + pagination.pageSize;

    return {
      items: items.slice(start, end),
      total: items.length,
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
    const course = await this.prisma.trainingCourse.findFirst({
      where: {
        id: courseId,
        isPublished: true,
        OR: [{ tenantId: null }, { tenantId }],
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
        latestAttempt: quiz.attempts[0] ?? null,
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
      assignment: course.assignments[0] ? this.mapAssignmentRecord(course.assignments[0], course) : null,
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
        progressRecords: { where: { tenantId, userId } },
        certificates: { where: { tenantId, userId } },
        assignments: { where: { tenantId, userId } },
        favorites: { where: { tenantId, userId } },
      },
    });

    if (!curriculum) {
      throw new NotFoundException('Training curriculum not found');
    }

    const completedCourses = curriculum.courses.filter(
      (course) => course.progressRecords[0]?.status === TrainingProgressStatus.COMPLETED,
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
        totalCourses: curriculum.courses.length,
        completedCourses,
        requiredCourses: curriculum.courses.filter((course) => course.isRequired).length,
      },
      courses: curriculum.courses.map((course) => this.mapCourseCard(course)),
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
  ) {
    await this.assertCourseVisible(tenantId, courseId);

    const progressPercent = dto.progressPercent ?? 0;
    const status =
      dto.status ??
      (dto.completedAt || progressPercent >= 100
        ? TrainingProgressStatus.COMPLETED
        : progressPercent > 0 || dto.startedAt
          ? TrainingProgressStatus.IN_PROGRESS
          : TrainingProgressStatus.NOT_STARTED);

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
        status,
      },
    });

    await this.syncAssignmentFromCourseProgress(tenantId, userId, courseId, progress);
    await this.syncCurriculumFromCourse(tenantId, userId, courseId);
    if (status === TrainingProgressStatus.COMPLETED) {
      await this.ensureCertificate(tenantId, userId, { courseId });
    }
    await this.syncAnalyticsSnapshot(tenantId, userId);
    return progress;
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

  async createQuizAttempt(tenantId: string, userId: string, quizId: string) {
    const quiz = await this.prisma.trainingQuiz.findUnique({
      where: { id: quizId },
      include: {
        course: true,
        attempts: {
          where: { tenantId, userId },
        },
      },
    });

    if (!quiz || (quiz.course.tenantId !== null && quiz.course.tenantId !== tenantId)) {
      throw new NotFoundException('Training quiz not found');
    }

    if (quiz.maxAttempts !== null && quiz.attempts.length >= quiz.maxAttempts) {
      throw new ForbiddenException('Max attempts reached for this quiz');
    }

    return this.prisma.trainingQuizAttempt.create({
      data: {
        tenantId,
        userId,
        quizId,
        startedAt: new Date(),
      },
    });
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
    if (!question) {
      throw new NotFoundException('Training quiz question not found');
    }

    const correctOption = question.options.find((item) => item.isCorrect);
    const isCorrect =
      question.questionType === TrainingQuizQuestionType.TEXT
        ? null
        : dto.optionId === correctOption?.id;

    return this.prisma.trainingQuizAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId: dto.questionId,
        },
      },
      update: {
        optionId: dto.optionId,
        textAnswer: dto.textAnswer,
        isCorrect,
      },
      create: {
        attemptId,
        questionId: dto.questionId,
        optionId: dto.optionId,
        textAnswer: dto.textAnswer,
        isCorrect,
      },
    });
  }

  async submitQuizAttempt(
    tenantId: string,
    userId: string,
    quizId: string,
    attemptId: string,
    _dto: SubmitTrainingQuizAttemptDto,
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

    const totalQuestions = attempt.quiz.questions.length;
    const correctAnswers = attempt.answers.filter((item) => item.isCorrect).length;
    const score = totalQuestions === 0 ? 0 : Math.round((correctAnswers / totalQuestions) * 100);
    const passed = score >= attempt.quiz.passingScore;

    const updated = await this.prisma.trainingQuizAttempt.update({
      where: { id: attemptId },
      data: {
        submittedAt: new Date(),
        score,
        passed,
        status: TrainingQuizAttemptStatus.GRADED,
      },
    });

    if (passed && attempt.quiz.course.steps[0]) {
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
      },
      orderBy: { issuedAt: 'desc' },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        certificateUrl: item.certificateUrl,
        issuedAt: item.issuedAt,
        expiresAt: item.expiresAt,
        course: item.course ? { id: item.course.id, title: item.course.title } : null,
        curriculum: item.curriculum ? { id: item.curriculum.id, title: item.curriculum.title } : null,
      })),
    };
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
    const existing = await this.prisma.trainingCertificate.findFirst({
      where: {
        tenantId,
        userId,
        ...(target.courseId ? { courseId: target.courseId } : {}),
        ...(target.curriculumId ? { curriculumId: target.curriculumId } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.prisma.trainingCertificate.create({
      data: {
        tenantId,
        userId,
        courseId: target.courseId,
        curriculumId: target.curriculumId,
        certificateUrl: `https://cdn.saasintegral.local/certificates/${userId}/${target.courseId ?? target.curriculumId}.pdf`,
        issuedAt: new Date(),
      },
    });
  }

  private mapAssignmentRecord(assignment: any, course?: any, curriculum?: any) {
    const baseCategory = course?.category ?? curriculum?.category ?? null;
    const overdue =
      Boolean(assignment.dueAt && assignment.dueAt < new Date() && assignment.status !== TrainingProgressStatus.COMPLETED);

    return {
      id: assignment.id,
      title: course?.title ?? curriculum?.title ?? 'Asignacion',
      description: course?.summary ?? curriculum?.description ?? null,
      summary: course?.summary ?? curriculum?.description ?? null,
      coverImageUrl: course?.coverImageUrl ?? curriculum?.coverImageUrl ?? null,
      type: assignment.assignmentType,
      progressPercent: assignment.progressPercent,
      status: overdue ? TrainingProgressStatus.OVERDUE : assignment.status,
      dueAt: assignment.dueAt,
      completedAt: assignment.completedAt,
      estimatedMinutes: course?.estimatedMinutes ?? curriculum?.estimatedMinutes ?? 0,
      category: baseCategory,
      favorite: Boolean(course?.favorites?.length ?? curriculum?.favorites?.length),
      assigned: true,
      tags: course?.tags ?? [],
      certificateEligible: true,
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
