import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TrainingContentBlockType,
  TrainingCourseStatus,
  TrainingCourseType,
  TrainingPilotStatus,
  TrainingQualityReviewStatus,
  TrainingQualityReviewType,
  TrainingResourceType,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  CreateTrainingCategoryDto,
  CreateTrainingContentBlockDto,
  CreateTrainingCourseDto,
  CreateTrainingCourseModuleDto,
  CreateTrainingCompetencyDto,
  CreateTrainingCoursePilotDto,
  CreateTrainingLessonDto,
  DuplicateTrainingCourseDto,
  ListTrainingAdminCoursesDto,
  ReorderTrainingEntitiesDto,
  RequestTrainingQualityReviewsDto,
  TrainingCourseScope,
  TransitionTrainingCourseDto,
  UpdateTrainingCategoryDto,
  UpdateTrainingContentBlockDto,
  UpdateTrainingCourseDto,
  UpdateTrainingCourseModuleDto,
  UpdateTrainingCompetencyDto,
  UpdateTrainingCourseDesignDto,
  UpdateTrainingLessonDto,
  UpdateTrainingCoursePilotStatusDto,
  DecideTrainingQualityReviewDto,
} from './dto/training-course-authoring.dto';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';

const courseTreeInclude = {
  category: true,
  modules: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      lessons: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          blocks: { orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
  transitions: { orderBy: { createdAt: 'desc' as const }, take: 50 },
  versions: { orderBy: { version: 'desc' as const } },
  brief: true,
  courseCompetencies: { orderBy: { sortOrder: 'asc' as const }, include: { competency: true } },
  learningObjectives: { orderBy: { sortOrder: 'asc' as const }, include: { competency: true } },
  audienceRules: { orderBy: { sortOrder: 'asc' as const } },
  certificationPolicy: true,
  qualityReviews: { orderBy: { updatedAt: 'desc' as const } },
  pilots: {
    orderBy: { updatedAt: 'desc' as const },
    include: { feedback: { orderBy: { updatedAt: 'desc' as const } } },
  },
  quizzes: {
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' as const },
        include: { options: { orderBy: { sortOrder: 'asc' as const } } },
      },
    },
  },
} satisfies Prisma.TrainingCourseInclude;

const editableStatuses = new Set<TrainingCourseStatus>([
  TrainingCourseStatus.DRAFT,
  TrainingCourseStatus.IN_REVIEW,
  TrainingCourseStatus.APPROVED,
  TrainingCourseStatus.PAUSED,
]);

export const allowedTrainingCourseTransitions: Record<
  TrainingCourseStatus,
  readonly TrainingCourseStatus[]
> = {
  DRAFT: [TrainingCourseStatus.IN_REVIEW, TrainingCourseStatus.ARCHIVED],
  IN_REVIEW: [TrainingCourseStatus.DRAFT, TrainingCourseStatus.APPROVED],
  APPROVED: [
    TrainingCourseStatus.SCHEDULED,
    TrainingCourseStatus.PUBLISHED,
    TrainingCourseStatus.ARCHIVED,
  ],
  SCHEDULED: [
    TrainingCourseStatus.DRAFT,
    TrainingCourseStatus.PUBLISHED,
    TrainingCourseStatus.ARCHIVED,
  ],
  PUBLISHED: [
    TrainingCourseStatus.PAUSED,
    TrainingCourseStatus.ARCHIVED,
    TrainingCourseStatus.RETIRED,
  ],
  PAUSED: [
    TrainingCourseStatus.PUBLISHED,
    TrainingCourseStatus.ARCHIVED,
    TrainingCourseStatus.RETIRED,
  ],
  ARCHIVED: [TrainingCourseStatus.RETIRED],
  RETIRED: [],
};

@Injectable()
export class TrainingAdminService {
  constructor(private readonly prisma: PrismaService, private readonly planLimits: PlanLimitsService) {}

  async listCourses(tenantId: string, actor: JwtPayload, query: ListTrainingAdminCoursesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const scope = this.scopeFilter(tenantId, actor, query.scope);
    const where: Prisma.TrainingCourseWhereInput = {
      ...scope,
      status: query.status,
      categoryId: query.categoryId,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { summary: { contains: query.search, mode: 'insensitive' } },
            { slug: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingCourse.findMany({
        where,
        include: {
          category: true,
          _count: { select: { modules: true, assignments: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trainingCourse.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async getCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, ...this.visibleScope(tenantId, actor) },
      include: courseTreeInclude,
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async createCourse(tenantId: string, actor: JwtPayload, dto: CreateTrainingCourseDto) {
    const targetTenantId = this.resolveWriteTenant(tenantId, actor, dto.scope);
    if (targetTenantId) await this.planLimits.assertCapacity(targetTenantId, 'maxCourses');
    await this.assertCategory(targetTenantId, dto.categoryId);
    const slug = await this.uniqueCourseSlug(targetTenantId, dto.slug ?? dto.title);
    const { modules = [], scope: _scope, ...courseData } = dto;
    return this.prisma.trainingCourse.create({
      data: {
        ...courseData,
        tenantId: targetTenantId,
        slug,
        type: TrainingCourseType.COURSE,
        resourceType: TrainingResourceType.ARTICLE,
        tags: dto.tags ?? [],
        createdById: actor.sub,
        updatedById: actor.sub,
        transitions: {
          create: {
            toStatus: TrainingCourseStatus.DRAFT,
            action: 'CREATED',
            actorId: actor.sub,
          },
        },
        modules: { create: modules.map((item) => this.moduleCreateInput(item)) },
      },
      include: courseTreeInclude,
    });
  }

  async updateCourse(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: UpdateTrainingCourseDto,
  ) {
    const current = await this.assertWritableCourse(tenantId, actor, courseId);
    if (!editableStatuses.has(current.status)) {
      throw new ConflictException(
        'Published, scheduled, archived or retired courses require a new version',
      );
    }
    const { modules: _modules, scope: _scope, slug: requestedSlug, ...data } = dto;
    await this.assertCategory(current.tenantId, dto.categoryId);
    const slug = requestedSlug
      ? await this.uniqueCourseSlug(current.tenantId, requestedSlug, courseId)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      await this.storeVersion(tx, courseId, actor.sub);
      return tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          ...data,
          slug,
          version: { increment: 1 },
          updatedById: actor.sub,
          transitions: {
            create: {
              fromStatus: current.status,
              toStatus: current.status,
              action: 'UPDATED',
              actorId: actor.sub,
            },
          },
        },
        include: courseTreeInclude,
      });
    });
  }

  async duplicateCourse(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: DuplicateTrainingCourseDto,
  ) {
    const source = await this.getCourse(tenantId, actor, courseId);
    const targetTenantId = source.tenantId;
    if (targetTenantId) await this.planLimits.assertCapacity(targetTenantId, 'maxCourses');
    if (targetTenantId === null && !this.canManageGlobal(actor)) {
      throw new ForbiddenException('Only a global super administrator can duplicate global content');
    }
    const title = dto.title?.trim() || `${source.title} (copia)`;
    const slug = await this.uniqueCourseSlug(targetTenantId, title);
    return this.prisma.trainingCourse.create({
      data: {
        tenantId: targetTenantId,
        categoryId: source.categoryId,
        title,
        slug,
        summary: source.summary,
        description: source.description,
        coverImageUrl: source.coverImageUrl,
        introVideoUrl: source.introVideoUrl,
        type: source.type,
        resourceType: source.resourceType,
        resourceUrl: source.resourceUrl,
        estimatedMinutes: source.estimatedMinutes,
        difficulty: source.difficulty,
        points: source.points,
        isRequired: source.isRequired,
        language: source.language,
        tags: source.tags,
        sourceCourseId: source.id,
        createdById: actor.sub,
        updatedById: actor.sub,
        transitions: {
          create: {
            toStatus: TrainingCourseStatus.DRAFT,
            action: 'DUPLICATED',
            actorId: actor.sub,
          },
        },
        brief: source.brief ? { create: {
          businessNeed: source.brief.businessNeed,
          targetOutcome: source.brief.targetOutcome,
          successKpi: source.brief.successKpi,
          audienceDescription: source.brief.audienceDescription,
          baselineMetric: source.brief.baselineMetric,
          targetMetric: source.brief.targetMetric,
          riskIfNotCompleted: source.brief.riskIfNotCompleted,
          contentOwnerId: source.brief.contentOwnerId,
          subjectMatterExpertId: source.brief.subjectMatterExpertId,
          targetDate: source.brief.targetDate,
        } } : undefined,
        courseCompetencies: { create: source.courseCompetencies.map((item) => ({
          competencyId: item.competencyId,
          targetLevel: item.targetLevel,
          isRequired: item.isRequired,
          sortOrder: item.sortOrder,
        })) },
        learningObjectives: { create: source.learningObjectives.map((item) => ({
          competencyId: item.competencyId,
          statement: item.statement,
          successCriteria: item.successCriteria,
          assessmentMethod: item.assessmentMethod,
          targetLevel: item.targetLevel,
          isRequired: item.isRequired,
          sortOrder: item.sortOrder,
        })) },
        audienceRules: { create: source.audienceRules.map((item) => ({
          ruleType: item.ruleType,
          operator: item.operator,
          value: item.value,
          description: item.description,
          sortOrder: item.sortOrder,
        })) },
        modules: {
          create: source.modules.map((module) => ({
            title: module.title,
            description: module.description,
            sortOrder: module.sortOrder,
            isRequired: module.isRequired,
            lessons: {
              create: module.lessons.map((lesson) => ({
                title: lesson.title,
                description: lesson.description,
                sortOrder: lesson.sortOrder,
                estimatedMinutes: lesson.estimatedMinutes,
                isRequired: lesson.isRequired,
                blocks: {
                  create: lesson.blocks.map((block) => ({
                    type: block.type,
                    title: block.title,
                    content: block.content ?? Prisma.JsonNull,
                    resourceUrl: block.resourceUrl,
                    sortOrder: block.sortOrder,
                    isRequired: block.isRequired,
                  })),
                },
              })),
            },
          })),
        },
        quizzes: {
          create: source.quizzes.map((quiz) => ({
            title: quiz.title,
            description: quiz.description,
            passingScore: quiz.passingScore,
            maxAttempts: quiz.maxAttempts,
            timeLimitMinutes: quiz.timeLimitMinutes,
            shuffleQuestions: quiz.shuffleQuestions,
            shuffleOptions: quiz.shuffleOptions,
            randomQuestionCount: quiz.randomQuestionCount,
            cooldownMinutes: quiz.cooldownMinutes,
            availableFrom: quiz.availableFrom,
            availableUntil: quiz.availableUntil,
            requireAllQuestions: quiz.requireAllQuestions,
            feedbackMode: quiz.feedbackMode,
            rubric: quiz.rubric as Prisma.InputJsonValue | undefined,
            questions: {
              create: quiz.questions.map((question) => ({
                bankItemId: source.tenantId === targetTenantId ? question.bankItemId : null,
                prompt: question.prompt,
                questionType: question.questionType,
                sortOrder: question.sortOrder,
                explanation: question.explanation,
                points: question.points,
                requiresManualGrading: question.requiresManualGrading,
                category: question.category,
                difficulty: question.difficulty,
                tags: question.tags,
                rubric: question.rubric as Prisma.InputJsonValue | undefined,
                options: {
                  create: question.options.map((option) => ({
                    label: option.label,
                    isCorrect: option.isCorrect,
                    sortOrder: option.sortOrder,
                  })),
                },
              })),
            },
          })),
        },
        certificationPolicy: source.certificationPolicy
          ? {
              create: {
                tenantId: targetTenantId!,
                isEnabled: source.certificationPolicy.isEnabled,
                autoIssue: source.certificationPolicy.autoIssue,
                requireAssessment: source.certificationPolicy.requireAssessment,
                requireAllRequiredLessons: source.certificationPolicy.requireAllRequiredLessons,
                validityDays: source.certificationPolicy.validityDays,
                renewalWindowDays: source.certificationPolicy.renewalWindowDays,
                reminderDays: source.certificationPolicy.reminderDays,
                certificateTitle: source.certificationPolicy.certificateTitle,
                certificateDescription: source.certificationPolicy.certificateDescription,
                signatoryName: source.certificationPolicy.signatoryName,
                signatoryTitle: source.certificationPolicy.signatoryTitle,
                badgeImageUrl: source.certificationPolicy.badgeImageUrl,
                createdById: actor.sub,
                updatedById: actor.sub,
              },
            }
          : undefined,
      },
      include: courseTreeInclude,
    });
  }

  async getCourseDesign(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.getCourse(tenantId, actor, courseId);
    return this.designResponse(course);
  }

  async updateCourseDesign(tenantId: string, actor: JwtPayload, courseId: string, dto: UpdateTrainingCourseDesignDto) {
    const course = await this.assertEditableCourse(tenantId, actor, courseId);
    const competencyIds = [...new Set(dto.competencies.map((item) => item.competencyId))];
    if (competencyIds.length !== dto.competencies.length) throw new BadRequestException('Competencies cannot be duplicated');
    const visibleCompetencies = await this.prisma.trainingCompetency.findMany({
      where: { id: { in: competencyIds }, OR: [{ tenantId: course.tenantId }, { tenantId: null }], isActive: true },
      select: { id: true },
    });
    if (visibleCompetencies.length !== competencyIds.length) throw new BadRequestException('A competency is outside the course scope');
    const selected = new Set(competencyIds);
    if (dto.objectives.some((item) => item.competencyId && !selected.has(item.competencyId))) {
      throw new BadRequestException('Every objective competency must be selected for the course');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.storeVersion(tx, courseId, actor.sub);
      await tx.trainingCourseBrief.upsert({
        where: { courseId },
        update: { ...dto.brief },
        create: { courseId, ...dto.brief },
      });
      await tx.trainingLearningObjective.deleteMany({ where: { courseId } });
      await tx.trainingCourseCompetency.deleteMany({ where: { courseId } });
      await tx.trainingAudienceRule.deleteMany({ where: { courseId } });
      if (dto.competencies.length) await tx.trainingCourseCompetency.createMany({ data: dto.competencies.map((item, index) => ({ courseId, competencyId: item.competencyId, targetLevel: item.targetLevel, isRequired: item.isRequired ?? true, sortOrder: item.sortOrder ?? index })) });
      if (dto.objectives.length) await tx.trainingLearningObjective.createMany({ data: dto.objectives.map((item, index) => ({ courseId, competencyId: item.competencyId, statement: item.statement.trim(), successCriteria: item.successCriteria.trim(), assessmentMethod: item.assessmentMethod.trim(), targetLevel: item.targetLevel, isRequired: item.isRequired ?? true, sortOrder: item.sortOrder ?? index })) });
      if (dto.audienceRules.length) await tx.trainingAudienceRule.createMany({ data: dto.audienceRules.map((item, index) => ({ courseId, ruleType: item.ruleType, operator: item.operator, value: item.value.trim(), description: item.description?.trim(), sortOrder: item.sortOrder ?? index })) });
      await tx.trainingCourse.update({ where: { id: courseId }, data: { version: { increment: 1 }, updatedById: actor.sub, transitions: { create: { fromStatus: course.status, toStatus: course.status, action: 'DESIGN_UPDATED', actorId: actor.sub } } } });
    });
    return this.getCourseDesign(tenantId, actor, courseId);
  }

  async listCompetencies(tenantId: string, actor: JwtPayload) {
    return this.prisma.trainingCompetency.findMany({
      where: this.canManageGlobal(actor) ? {} : { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: [{ tenantId: 'desc' }, { name: 'asc' }],
    });
  }

  async createCompetency(tenantId: string, actor: JwtPayload, dto: CreateTrainingCompetencyDto) {
    const targetTenantId = this.resolveWriteTenant(tenantId, actor, dto.scope);
    const exists = await this.prisma.trainingCompetency.findFirst({ where: { tenantId: targetTenantId, code: dto.code.trim().toUpperCase() } });
    if (exists) throw new ConflictException('A competency with this code already exists');
    const { scope: _scope, ...data } = dto;
    return this.prisma.trainingCompetency.create({ data: { ...data, tenantId: targetTenantId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), createdById: actor.sub } });
  }

  async updateCompetency(tenantId: string, actor: JwtPayload, competencyId: string, dto: UpdateTrainingCompetencyDto) {
    const competency = await this.prisma.trainingCompetency.findUnique({ where: { id: competencyId } });
    if (!competency) throw new NotFoundException('Competency not found');
    if ((competency.tenantId === null && !this.canManageGlobal(actor)) || (competency.tenantId && competency.tenantId !== tenantId && !this.canManageGlobal(actor))) throw new ForbiddenException('Competency is outside the active tenant scope');
    const { scope: _scope, ...data } = dto;
    return this.prisma.trainingCompetency.update({ where: { id: competencyId }, data: { ...data, code: dto.code?.trim().toUpperCase(), name: dto.name?.trim() } });
  }

  async transitionCourse(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: TransitionTrainingCourseDto,
  ) {
    const course = await this.assertWritableCourse(tenantId, actor, courseId);
    if (!allowedTrainingCourseTransitions[course.status].includes(dto.status)) {
      throw new ConflictException(`Transition ${course.status} → ${dto.status} is not allowed`);
    }
    if (
      [
        TrainingCourseStatus.IN_REVIEW,
        TrainingCourseStatus.APPROVED,
        TrainingCourseStatus.PUBLISHED,
        TrainingCourseStatus.SCHEDULED,
      ].some((status) => status === dto.status)
    ) {
      await this.assertCourseComplete(courseId);
    }
    if (
      [TrainingCourseStatus.APPROVED, TrainingCourseStatus.PUBLISHED, TrainingCourseStatus.SCHEDULED]
        .some((status) => status === dto.status)
    ) {
      await this.assertQualityApproved(courseId, course.version);
    }
    if (
      dto.status === TrainingCourseStatus.SCHEDULED &&
      (!dto.scheduledPublishAt || dto.scheduledPublishAt <= new Date())
    ) {
      throw new BadRequestException('A future scheduledPublishAt is required');
    }
    const isPublished = dto.status === TrainingCourseStatus.PUBLISHED;
    const reviewVersion = dto.status === TrainingCourseStatus.IN_REVIEW
      ? course.version + 1
      : course.version;
    return this.prisma.$transaction(async (tx) => {
      await this.storeVersion(tx, courseId, actor.sub);
      if (dto.status === TrainingCourseStatus.IN_REVIEW) {
        await tx.trainingCourseQualityReview.createMany({
          data: this.requiredReviewTypes().map((reviewType) => ({
            tenantId: course.tenantId,
            courseId,
            courseVersion: reviewVersion,
            reviewType,
            requestedById: actor.sub,
            checklist: {},
          })),
          skipDuplicates: true,
        });
      }
      return tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          status: dto.status,
          version: dto.status === TrainingCourseStatus.IN_REVIEW ? { increment: 1 } : undefined,
          isPublished,
          scheduledPublishAt:
            dto.status === TrainingCourseStatus.SCHEDULED
              ? dto.scheduledPublishAt
              : dto.status === TrainingCourseStatus.PUBLISHED
                ? null
                : undefined,
          scheduledRetireAt: dto.scheduledRetireAt,
          publishedAt: isPublished ? new Date() : undefined,
          retiredAt: dto.status === TrainingCourseStatus.RETIRED ? new Date() : undefined,
          updatedById: actor.sub,
          transitions: {
            create: {
              fromStatus: course.status,
              toStatus: dto.status,
              action: dto.status,
              actorId: actor.sub,
              reason: dto.reason,
            },
          },
        },
        include: courseTreeInclude,
      });
    });
  }

  async getCourseQuality(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.getCourse(tenantId, actor, courseId);
    return this.qualityResponse(course);
  }

  async requestQualityReviews(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: RequestTrainingQualityReviewsDto,
  ) {
    const course = await this.assertWritableCourse(tenantId, actor, courseId);
    if (course.status !== TrainingCourseStatus.IN_REVIEW) {
      throw new ConflictException('Quality review can only be requested after submitting the course for review');
    }
    await this.prisma.trainingCourseQualityReview.createMany({
      data: dto.reviewTypes.map((reviewType) => ({
        tenantId: course.tenantId,
        courseId,
        courseVersion: course.version,
        reviewType,
        reviewerId: dto.reviewerId,
        requestedById: actor.sub,
        checklist: {},
      })),
      skipDuplicates: true,
    });
    return this.getCourseQuality(tenantId, actor, courseId);
  }

  async decideQualityReview(
    tenantId: string,
    actor: JwtPayload,
    reviewId: string,
    dto: DecideTrainingQualityReviewDto,
  ) {
    if (dto.status === TrainingQualityReviewStatus.PENDING) {
      throw new BadRequestException('A review decision must approve or request changes');
    }
    if (
      dto.status === TrainingQualityReviewStatus.APPROVED &&
      (!Object.keys(dto.checklist).length || Object.values(dto.checklist).some((value) => value !== true))
    ) {
      throw new BadRequestException('Every quality checklist item must pass before approval');
    }
    const review = await this.prisma.trainingCourseQualityReview.findUnique({
      where: { id: reviewId },
      include: { course: true },
    });
    if (!review) throw new NotFoundException('Quality review not found');
    await this.assertWritableCourse(tenantId, actor, review.courseId);
    if (review.courseVersion !== review.course.version) {
      throw new ConflictException('This review belongs to an obsolete course version');
    }
    if (review.reviewerId && review.reviewerId !== actor.sub && !this.canManageGlobal(actor)) {
      throw new ForbiddenException('This review is assigned to another reviewer');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.trainingCourseQualityReview.update({
        where: { id: reviewId },
        data: {
          status: dto.status,
          reviewerId: review.reviewerId ?? actor.sub,
          checklist: dto.checklist as Prisma.InputJsonValue,
          summary: dto.summary,
          decidedAt: new Date(),
        },
      });
      if (
        dto.status === TrainingQualityReviewStatus.CHANGES_REQUESTED &&
        review.course.status === TrainingCourseStatus.IN_REVIEW
      ) {
        await tx.trainingCourse.update({
          where: { id: review.courseId },
          data: {
            status: TrainingCourseStatus.DRAFT,
            transitions: {
              create: {
                fromStatus: TrainingCourseStatus.IN_REVIEW,
                toStatus: TrainingCourseStatus.DRAFT,
                action: 'QUALITY_CHANGES_REQUESTED',
                actorId: actor.sub,
                reason: dto.summary,
              },
            },
          },
        });
      }
    });
    return this.getCourseQuality(tenantId, actor, review.courseId);
  }

  async createCoursePilot(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: CreateTrainingCoursePilotDto,
  ) {
    const course = await this.assertWritableCourse(tenantId, actor, courseId);
    if (!course.tenantId || course.tenantId !== tenantId) {
      throw new BadRequestException('Pilots require a tenant-owned course');
    }
    if (course.status !== TrainingCourseStatus.IN_REVIEW) {
      throw new ConflictException('A pilot can only be created for the version currently in review');
    }
    if (dto.startsAt && dto.endsAt && dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('Pilot end must be after its start');
    }
    const participants = await this.prisma.user.findMany({
      where: { id: { in: dto.participantIds }, tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (participants.length !== dto.participantIds.length || participants.length === 0) {
      throw new BadRequestException('Every pilot participant must be active in the tenant');
    }
    return this.prisma.trainingCoursePilot.create({
      data: {
        tenantId,
        courseId,
        courseVersion: course.version,
        name: dto.name.trim(),
        participantIds: dto.participantIds,
        successCriteria: dto.successCriteria as Prisma.InputJsonValue,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        createdById: actor.sub,
      },
      include: { feedback: true },
    });
  }

  async updateCoursePilotStatus(
    tenantId: string,
    actor: JwtPayload,
    pilotId: string,
    dto: UpdateTrainingCoursePilotStatusDto,
  ) {
    const pilot = await this.prisma.trainingCoursePilot.findFirst({
      where: { id: pilotId, tenantId },
      include: { course: true, feedback: true },
    });
    if (!pilot) throw new NotFoundException('Course pilot not found');
    await this.assertWritableCourse(tenantId, actor, pilot.courseId);
    const transitions: Record<TrainingPilotStatus, TrainingPilotStatus[]> = {
      DRAFT: [TrainingPilotStatus.ACTIVE, TrainingPilotStatus.CANCELLED],
      ACTIVE: [TrainingPilotStatus.COMPLETED, TrainingPilotStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!transitions[pilot.status].includes(dto.status)) {
      throw new ConflictException(`Pilot transition ${pilot.status} → ${dto.status} is not allowed`);
    }
    if (dto.status === TrainingPilotStatus.COMPLETED) this.assertPilotSuccessful(pilot);
    const now = new Date();
    if (dto.status === TrainingPilotStatus.ACTIVE) {
      await this.prisma.notification.createMany({
        data: pilot.participantIds.map((userId) => ({
          tenantId,
          userId,
          type: 'INFO',
          title: 'Invitación a piloto de capacitación',
          message: `Participa en el piloto “${pilot.name}” y comparte tu experiencia.`,
          payload: { kind: 'TRAINING_PILOT_INVITATION', pilotId, courseId: pilot.courseId },
        })),
      });
    }
    return this.prisma.trainingCoursePilot.update({
      where: { id: pilotId },
      data: {
        status: dto.status,
        activatedAt: dto.status === TrainingPilotStatus.ACTIVE ? now : undefined,
        completedAt: dto.status === TrainingPilotStatus.COMPLETED ? now : undefined,
      },
      include: { feedback: true },
    });
  }

  async deleteCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.assertDeletableCourse(tenantId, actor, courseId);
    if (
      ![TrainingCourseStatus.DRAFT, TrainingCourseStatus.ARCHIVED].some(
        (status) => status === course.status,
      )
    ) {
      throw new ConflictException('Only draft or archived courses can be deleted');
    }
    if (course.status === TrainingCourseStatus.ARCHIVED) {
      const dependencies = await this.prisma.trainingCourse.findUnique({
        where: { id: courseId },
        select: { _count: { select: { assignments: true, progressRecords: true } } },
      });
      if (
        (dependencies?._count.assignments ?? 0) > 0 ||
        (dependencies?._count.progressRecords ?? 0) > 0
      ) {
        throw new ConflictException('The course has assignments or progress and cannot be deleted');
      }
    }
    await this.prisma.trainingCourse.delete({ where: { id: courseId } });
    return { deleted: true, id: courseId };
  }

  async createModule(
    tenantId: string,
    actor: JwtPayload,
    courseId: string,
    dto: CreateTrainingCourseModuleDto,
  ) {
    await this.assertEditableCourse(tenantId, actor, courseId);
    return this.prisma.trainingCourseModule.create({
      data: { courseId, ...this.moduleCreateInput(dto) },
      include: { lessons: { include: { blocks: true } } },
    });
  }

  async updateModule(
    tenantId: string,
    actor: JwtPayload,
    moduleId: string,
    dto: UpdateTrainingCourseModuleDto,
  ) {
    const module = await this.findOwnedModule(tenantId, actor, moduleId);
    await this.assertEditableCourse(tenantId, actor, module.courseId);
    const { lessons: _lessons, ...data } = dto;
    return this.prisma.trainingCourseModule.update({ where: { id: moduleId }, data });
  }

  async deleteModule(tenantId: string, actor: JwtPayload, moduleId: string) {
    const module = await this.findOwnedModule(tenantId, actor, moduleId);
    await this.assertEditableCourse(tenantId, actor, module.courseId);
    await this.prisma.trainingCourseModule.delete({ where: { id: moduleId } });
    return { deleted: true, id: moduleId };
  }

  async duplicateModule(tenantId: string, actor: JwtPayload, moduleId: string) {
    const module = await this.prisma.trainingCourseModule.findUnique({
      where: { id: moduleId },
      include: { lessons: { orderBy: { sortOrder: 'asc' }, include: { blocks: { orderBy: { sortOrder: 'asc' } } } } },
    });
    if (!module) throw new NotFoundException('Course module not found');
    await this.assertEditableCourse(tenantId, actor, module.courseId);
    const sortOrder = await this.prisma.trainingCourseModule.count({ where: { courseId: module.courseId } });
    return this.prisma.trainingCourseModule.create({
      data: {
        courseId: module.courseId,
        title: `${module.title} (copia)`,
        description: module.description,
        isRequired: module.isRequired,
        sortOrder,
        lessons: {
          create: module.lessons.map((lesson, lessonIndex) => ({
            title: lesson.title,
            description: lesson.description,
            estimatedMinutes: lesson.estimatedMinutes,
            isRequired: lesson.isRequired,
            sortOrder: lessonIndex,
            blocks: {
              create: lesson.blocks.map((block, blockIndex) => ({
                type: block.type,
                title: block.title,
                content: block.content as Prisma.InputJsonValue | undefined,
                resourceUrl: block.resourceUrl,
                isRequired: block.isRequired,
                sortOrder: blockIndex,
              })),
            },
          })),
        },
      },
      include: { lessons: { orderBy: { sortOrder: 'asc' }, include: { blocks: { orderBy: { sortOrder: 'asc' } } } } },
    });
  }

  async reorderModules(tenantId: string, actor: JwtPayload, courseId: string, dto: ReorderTrainingEntitiesDto) {
    await this.assertEditableCourse(tenantId, actor, courseId);
    const modules = await this.prisma.trainingCourseModule.findMany({ where: { courseId }, select: { id: true } });
    this.assertCompleteOrder(modules.map((item) => item.id), dto.entityIds, 'modules');
    await this.prisma.$transaction(dto.entityIds.map((id, sortOrder) => this.prisma.trainingCourseModule.update({ where: { id }, data: { sortOrder } })));
    return { ordered: true, entityIds: dto.entityIds };
  }

  async createLesson(
    tenantId: string,
    actor: JwtPayload,
    moduleId: string,
    dto: CreateTrainingLessonDto,
  ) {
    const module = await this.findOwnedModule(tenantId, actor, moduleId);
    await this.assertEditableCourse(tenantId, actor, module.courseId);
    return this.prisma.trainingLesson.create({
      data: { moduleId, ...this.lessonCreateInput(dto) },
      include: { blocks: true },
    });
  }

  async updateLesson(
    tenantId: string,
    actor: JwtPayload,
    lessonId: string,
    dto: UpdateTrainingLessonDto,
  ) {
    const lesson = await this.findOwnedLesson(tenantId, actor, lessonId);
    await this.assertEditableCourse(tenantId, actor, lesson.module.courseId);
    const { blocks: _blocks, ...data } = dto;
    return this.prisma.trainingLesson.update({ where: { id: lessonId }, data });
  }

  async deleteLesson(tenantId: string, actor: JwtPayload, lessonId: string) {
    const lesson = await this.findOwnedLesson(tenantId, actor, lessonId);
    await this.assertEditableCourse(tenantId, actor, lesson.module.courseId);
    await this.prisma.trainingLesson.delete({ where: { id: lessonId } });
    return { deleted: true, id: lessonId };
  }

  async duplicateLesson(tenantId: string, actor: JwtPayload, lessonId: string) {
    const lesson = await this.prisma.trainingLesson.findUnique({
      where: { id: lessonId },
      include: { module: true, blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertEditableCourse(tenantId, actor, lesson.module.courseId);
    const sortOrder = await this.prisma.trainingLesson.count({ where: { moduleId: lesson.moduleId } });
    return this.prisma.trainingLesson.create({
      data: {
        moduleId: lesson.moduleId,
        title: `${lesson.title} (copia)`,
        description: lesson.description,
        estimatedMinutes: lesson.estimatedMinutes,
        isRequired: lesson.isRequired,
        sortOrder,
        blocks: {
          create: lesson.blocks.map((block, blockIndex) => ({
            type: block.type,
            title: block.title,
            content: block.content as Prisma.InputJsonValue | undefined,
            resourceUrl: block.resourceUrl,
            isRequired: block.isRequired,
            sortOrder: blockIndex,
          })),
        },
      },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async reorderLessons(tenantId: string, actor: JwtPayload, moduleId: string, dto: ReorderTrainingEntitiesDto) {
    const module = await this.findOwnedModule(tenantId, actor, moduleId);
    await this.assertEditableCourse(tenantId, actor, module.courseId);
    const lessons = await this.prisma.trainingLesson.findMany({ where: { moduleId }, select: { id: true } });
    this.assertCompleteOrder(lessons.map((item) => item.id), dto.entityIds, 'lessons');
    await this.prisma.$transaction(dto.entityIds.map((id, sortOrder) => this.prisma.trainingLesson.update({ where: { id }, data: { sortOrder } })));
    return { ordered: true, entityIds: dto.entityIds };
  }

  async createBlock(
    tenantId: string,
    actor: JwtPayload,
    lessonId: string,
    dto: CreateTrainingContentBlockDto,
  ) {
    const lesson = await this.findOwnedLesson(tenantId, actor, lessonId);
    await this.assertEditableCourse(tenantId, actor, lesson.module.courseId);
    this.validateBlock(dto);
    return this.prisma.trainingContentBlock.create({
      data: { lessonId, ...this.blockCreateInput(dto) },
    });
  }

  async updateBlock(
    tenantId: string,
    actor: JwtPayload,
    blockId: string,
    dto: UpdateTrainingContentBlockDto,
  ) {
    const block = await this.findOwnedBlock(tenantId, actor, blockId);
    await this.assertEditableCourse(tenantId, actor, block.lesson.module.courseId);
    this.validateBlock({ ...block, ...dto });
    return this.prisma.trainingContentBlock.update({
      where: { id: blockId },
      data: {
        ...dto,
        content: dto.content as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async deleteBlock(tenantId: string, actor: JwtPayload, blockId: string) {
    const block = await this.findOwnedBlock(tenantId, actor, blockId);
    await this.assertEditableCourse(tenantId, actor, block.lesson.module.courseId);
    await this.prisma.trainingContentBlock.delete({ where: { id: blockId } });
    return { deleted: true, id: blockId };
  }

  async duplicateBlock(tenantId: string, actor: JwtPayload, blockId: string) {
    const block = await this.findOwnedBlock(tenantId, actor, blockId);
    await this.assertEditableCourse(tenantId, actor, block.lesson.module.courseId);
    const sortOrder = await this.prisma.trainingContentBlock.count({ where: { lessonId: block.lessonId } });
    return this.prisma.trainingContentBlock.create({
      data: {
        lessonId: block.lessonId,
        type: block.type,
        title: block.title ? `${block.title} (copia)` : null,
        content: block.content as Prisma.InputJsonValue | undefined,
        resourceUrl: block.resourceUrl,
        isRequired: block.isRequired,
        sortOrder,
      },
    });
  }

  async reorderBlocks(tenantId: string, actor: JwtPayload, lessonId: string, dto: ReorderTrainingEntitiesDto) {
    const lesson = await this.findOwnedLesson(tenantId, actor, lessonId);
    await this.assertEditableCourse(tenantId, actor, lesson.module.courseId);
    const blocks = await this.prisma.trainingContentBlock.findMany({ where: { lessonId }, select: { id: true } });
    this.assertCompleteOrder(blocks.map((item) => item.id), dto.entityIds, 'blocks');
    await this.prisma.$transaction(dto.entityIds.map((id, sortOrder) => this.prisma.trainingContentBlock.update({ where: { id }, data: { sortOrder } })));
    return { ordered: true, entityIds: dto.entityIds };
  }

  async listCategories(tenantId: string, actor: JwtPayload) {
    return this.prisma.trainingCategory.findMany({
      where: this.canManageGlobal(actor)
        ? {}
        : { OR: [{ tenantId }, { tenantId: null }] },
      include: { childCategories: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateTrainingCategoryDto,
  ) {
    const targetTenantId = this.resolveWriteTenant(tenantId, actor, dto.scope);
    await this.assertCategory(targetTenantId, dto.parentCategoryId);
    const { scope: _scope, ...data } = dto;
    return this.prisma.trainingCategory.create({
      data: {
        ...data,
        tenantId: targetTenantId,
        slug: await this.uniqueCategorySlug(targetTenantId, dto.slug ?? dto.name),
      },
    });
  }

  async updateCategory(
    tenantId: string,
    actor: JwtPayload,
    categoryId: string,
    dto: UpdateTrainingCategoryDto,
  ) {
    const category = await this.assertWritableCategory(tenantId, actor, categoryId);
    if (dto.parentCategoryId === categoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    await this.assertCategory(category.tenantId, dto.parentCategoryId);
    const { scope: _scope, slug: requestedSlug, ...data } = dto;
    return this.prisma.trainingCategory.update({
      where: { id: categoryId },
      data: {
        ...data,
        slug: requestedSlug
          ? await this.uniqueCategorySlug(category.tenantId, requestedSlug, categoryId)
          : undefined,
      },
    });
  }

  private visibleScope(tenantId: string, actor: JwtPayload): Prisma.TrainingCourseWhereInput {
    return this.canManageGlobal(actor)
      ? {}
      : { OR: [{ tenantId }, { tenantId: null }] };
  }

  private scopeFilter(
    tenantId: string,
    actor: JwtPayload,
    scope?: TrainingCourseScope,
  ): Prisma.TrainingCourseWhereInput {
    if (scope === TrainingCourseScope.GLOBAL) return { tenantId: null };
    if (scope === TrainingCourseScope.TENANT) return { tenantId };
    return this.visibleScope(tenantId, actor);
  }

  private resolveWriteTenant(
    tenantId: string,
    actor: JwtPayload,
    scope?: TrainingCourseScope,
  ): string | null {
    if (scope === TrainingCourseScope.GLOBAL) {
      if (!this.canManageGlobal(actor)) {
        throw new ForbiddenException('Only a global super administrator can manage global content');
      }
      return null;
    }
    return tenantId;
  }

  private canManageGlobal(actor: JwtPayload) {
    return actor.isSuperAdmin && actor.isGlobalContext;
  }

  private async assertWritableCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (
      (course.tenantId === null && !this.canManageGlobal(actor)) ||
      (course.tenantId !== null && course.tenantId !== tenantId && !this.canManageGlobal(actor))
    ) {
      throw new ForbiddenException('Course is outside the active tenant scope');
    }
    return course;
  }

  private async assertDeletableCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const canDeleteOwnGlobalDraft =
      course.tenantId === null &&
      course.status === TrainingCourseStatus.DRAFT &&
      course.createdById === actor.sub;

    if (
      !canDeleteOwnGlobalDraft &&
      ((course.tenantId === null && !this.canManageGlobal(actor)) ||
        (course.tenantId !== null &&
          course.tenantId !== tenantId &&
          !this.canManageGlobal(actor)))
    ) {
      throw new ForbiddenException('Course is outside the active tenant scope');
    }
    return course;
  }

  private async assertEditableCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.assertWritableCourse(tenantId, actor, courseId);
    if (!editableStatuses.has(course.status)) {
      throw new ConflictException('Course content cannot be edited in its current status');
    }
    return course;
  }

  private async assertCourseComplete(courseId: string) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        brief: true,
        courseCompetencies: true,
        learningObjectives: true,
        audienceRules: true,
        modules: {
          include: { lessons: { include: { blocks: true } } },
        },
      },
    });
    if (!course?.summary?.trim() || !course.description?.trim()) {
      throw new BadRequestException('Summary and description are required before review');
    }
    if (!course.brief?.businessNeed.trim() || !course.brief.targetOutcome.trim() || !course.brief.successKpi.trim()) {
      throw new BadRequestException('Business need, target outcome and success KPI are required before review');
    }
    if (!course.brief.audienceDescription?.trim() && course.audienceRules.length === 0) {
      throw new BadRequestException('The target audience is required before review');
    }
    if (course.courseCompetencies.length === 0 || course.learningObjectives.length === 0) {
      throw new BadRequestException('At least one competency and learning objective are required before review');
    }
    if (
      course.modules.length === 0 ||
      course.modules.some(
        (module) =>
          module.lessons.length === 0 ||
          module.lessons.some(
            (lesson) => (lesson.estimatedMinutes ?? 0) <= 0 || lesson.blocks.length === 0,
          ),
      )
    ) {
      throw new BadRequestException(
        'Every course needs modules, lessons with estimated duration and content blocks',
      );
    }
  }

  private async storeVersion(
    tx: Prisma.TransactionClient,
    courseId: string,
    actorId: string,
  ) {
    const current = await tx.trainingCourse.findUnique({
      where: { id: courseId },
      include: courseTreeInclude,
    });
    if (!current) throw new NotFoundException('Course not found');
    await tx.trainingCourseVersion.upsert({
      where: { courseId_version: { courseId, version: current.version } },
      update: {},
      create: {
        courseId,
        version: current.version,
        status: current.status,
        snapshot: JSON.parse(JSON.stringify(current)) as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
  }

  private designResponse(course: any) {
    const errors = [
      !course.brief?.businessNeed?.trim() ? 'Define la necesidad del negocio' : null,
      !course.brief?.targetOutcome?.trim() ? 'Define el resultado esperado' : null,
      !course.brief?.successKpi?.trim() ? 'Define el KPI de éxito' : null,
      !course.brief?.audienceDescription?.trim() && !course.audienceRules?.length ? 'Define la audiencia' : null,
      !course.courseCompetencies?.length ? 'Selecciona al menos una competencia' : null,
      !course.learningObjectives?.length ? 'Agrega al menos un objetivo de aprendizaje' : null,
    ].filter(Boolean);
    return { brief: course.brief, competencies: course.courseCompetencies ?? [], objectives: course.learningObjectives ?? [], audienceRules: course.audienceRules ?? [], readiness: { ready: errors.length === 0, errors } };
  }

  private requiredReviewTypes() {
    return [
      TrainingQualityReviewType.CONTENT,
      TrainingQualityReviewType.PEDAGOGY,
      TrainingQualityReviewType.ACCESSIBILITY,
      TrainingQualityReviewType.COMPLIANCE,
    ];
  }

  private qualityResponse(course: any) {
    const reviews = (course.qualityReviews ?? []).filter(
      (review: any) => review.courseVersion === course.version,
    );
    const pilots = (course.pilots ?? []).filter(
      (pilot: any) => pilot.courseVersion === course.version,
    );
    const errors = [
      ...this.requiredReviewTypes()
        .filter((type) => !reviews.some((review: any) =>
          review.reviewType === type && review.status === TrainingQualityReviewStatus.APPROVED,
        ))
        .map((type) => `Falta aprobación de ${type.toLowerCase()}`),
      pilots.some((pilot: any) => pilot.status !== TrainingPilotStatus.CANCELLED) &&
      !pilots.some((pilot: any) => pilot.status === TrainingPilotStatus.COMPLETED)
        ? 'El piloto de la versión actual no está completado'
        : null,
    ].filter(Boolean);
    return {
      courseId: course.id,
      courseVersion: course.version,
      reviews,
      pilots: pilots.map((pilot: any) => ({ ...pilot, metrics: this.pilotMetrics(pilot) })),
      readiness: { ready: errors.length === 0, errors },
    };
  }

  private async assertQualityApproved(courseId: string, courseVersion: number) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        qualityReviews: { where: { courseVersion } },
        pilots: { where: { courseVersion }, include: { feedback: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const quality = this.qualityResponse(course);
    if (!quality.readiness.ready) {
      throw new BadRequestException(`Quality gates are incomplete: ${quality.readiness.errors.join('; ')}`);
    }
  }

  private assertPilotSuccessful(pilot: any) {
    const metrics = this.pilotMetrics(pilot);
    const criteria = (pilot.successCriteria ?? {}) as Record<string, unknown>;
    const minResponses = Number(criteria.minResponses ?? 1);
    const minAverageRating = Number(criteria.minAverageRating ?? 4);
    if (metrics.responses < minResponses) {
      throw new BadRequestException(`Pilot requires at least ${minResponses} feedback responses`);
    }
    if (metrics.averageRating < minAverageRating) {
      throw new BadRequestException(`Pilot average rating must be at least ${minAverageRating}`);
    }
    if (metrics.blockingIssues > 0) {
      throw new BadRequestException('Pilot has unresolved blocking issues');
    }
  }

  private pilotMetrics(pilot: any) {
    const feedback = pilot.feedback ?? [];
    const average = (field: string) => feedback.length
      ? Number((feedback.reduce((sum: number, item: any) => sum + item[field], 0) / feedback.length).toFixed(2))
      : 0;
    return {
      participants: pilot.participantIds?.length ?? 0,
      responses: feedback.length,
      averageRating: average('rating'),
      averageClarity: average('clarityRating'),
      averageRelevance: average('relevanceRating'),
      blockingIssues: feedback.filter((item: any) => item.blockingIssue).length,
    };
  }

  private moduleCreateInput(dto: CreateTrainingCourseModuleDto) {
    const { lessons = [], ...data } = dto;
    return {
      ...data,
      lessons: { create: lessons.map((lesson) => this.lessonCreateInput(lesson)) },
    };
  }

  private lessonCreateInput(dto: CreateTrainingLessonDto) {
    const { blocks = [], ...data } = dto;
    blocks.forEach((block) => this.validateBlock(block));
    return {
      ...data,
      blocks: { create: blocks.map((block) => this.blockCreateInput(block)) },
    };
  }

  private blockCreateInput(dto: CreateTrainingContentBlockDto) {
    return {
      ...dto,
      content: dto.content as Prisma.InputJsonValue | undefined,
    };
  }

  private validateBlock(dto: {
    type: TrainingContentBlockType;
    content?: unknown;
    resourceUrl?: string | null;
  }) {
    const resourceTypes = new Set<TrainingContentBlockType>([
      TrainingContentBlockType.VIDEO,
      TrainingContentBlockType.FILE,
      TrainingContentBlockType.LINK,
    ]);
    if (resourceTypes.has(dto.type) && !dto.resourceUrl) {
      throw new BadRequestException(`resourceUrl is required for ${dto.type} blocks`);
    }
    if (!resourceTypes.has(dto.type) && !dto.content) {
      throw new BadRequestException(`content is required for ${dto.type} blocks`);
    }
  }

  private assertCompleteOrder(existingIds: string[], orderedIds: string[], entityName: string) {
    const existing = new Set(existingIds);
    if (
      existingIds.length !== orderedIds.length ||
      orderedIds.some((id) => !existing.has(id))
    ) {
      throw new BadRequestException(`The order must include every ${entityName} item exactly once`);
    }
  }

  private async findOwnedModule(tenantId: string, actor: JwtPayload, moduleId: string) {
    const module = await this.prisma.trainingCourseModule.findUnique({
      where: { id: moduleId },
      include: { course: true },
    });
    if (!module) throw new NotFoundException('Course module not found');
    await this.assertWritableCourse(tenantId, actor, module.courseId);
    return module;
  }

  private async findOwnedLesson(tenantId: string, actor: JwtPayload, lessonId: string) {
    const lesson = await this.prisma.trainingLesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertWritableCourse(tenantId, actor, lesson.module.courseId);
    return lesson;
  }

  private async findOwnedBlock(tenantId: string, actor: JwtPayload, blockId: string) {
    const block = await this.prisma.trainingContentBlock.findUnique({
      where: { id: blockId },
      include: { lesson: { include: { module: { include: { course: true } } } } },
    });
    if (!block) throw new NotFoundException('Content block not found');
    await this.assertWritableCourse(tenantId, actor, block.lesson.module.courseId);
    return block;
  }

  private async assertCategory(tenantId: string | null, categoryId?: string) {
    if (!categoryId) return;
    const category = await this.prisma.trainingCategory.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category) throw new BadRequestException('Category does not belong to the content scope');
  }

  private async assertWritableCategory(tenantId: string, actor: JwtPayload, categoryId: string) {
    const category = await this.prisma.trainingCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    if (
      (category.tenantId === null && !this.canManageGlobal(actor)) ||
      (category.tenantId !== null && category.tenantId !== tenantId && !this.canManageGlobal(actor))
    ) {
      throw new ForbiddenException('Category is outside the active tenant scope');
    }
    return category;
  }

  private slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200);
  }

  private async uniqueCourseSlug(
    tenantId: string | null,
    value: string,
    excludeId?: string,
  ) {
    const base = this.slugify(value) || 'curso';
    let candidate = base;
    let suffix = 2;
    while (
      await this.prisma.trainingCourse.findFirst({
        where: { tenantId, slug: candidate, id: excludeId ? { not: excludeId } : undefined },
        select: { id: true },
      })
    ) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private async uniqueCategorySlug(
    tenantId: string | null,
    value: string,
    excludeId?: string,
  ) {
    const base = this.slugify(value) || 'categoria';
    let candidate = base;
    let suffix = 2;
    while (
      await this.prisma.trainingCategory.findFirst({
        where: { tenantId, slug: candidate, id: excludeId ? { not: excludeId } : undefined },
        select: { id: true },
      })
    ) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }
}
