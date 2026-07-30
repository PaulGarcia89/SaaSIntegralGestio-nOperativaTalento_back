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
  TrainingResourceType,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  CreateTrainingCategoryDto,
  CreateTrainingContentBlockDto,
  CreateTrainingCourseDto,
  CreateTrainingCourseModuleDto,
  CreateTrainingLessonDto,
  DuplicateTrainingCourseDto,
  ListTrainingAdminCoursesDto,
  TrainingCourseScope,
  TransitionTrainingCourseDto,
  UpdateTrainingCategoryDto,
  UpdateTrainingContentBlockDto,
  UpdateTrainingCourseDto,
  UpdateTrainingCourseModuleDto,
  UpdateTrainingLessonDto,
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
      },
      include: courseTreeInclude,
    });
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
      dto.status === TrainingCourseStatus.SCHEDULED &&
      (!dto.scheduledPublishAt || dto.scheduledPublishAt <= new Date())
    ) {
      throw new BadRequestException('A future scheduledPublishAt is required');
    }
    const isPublished = dto.status === TrainingCourseStatus.PUBLISHED;
    return this.prisma.$transaction(async (tx) => {
      await this.storeVersion(tx, courseId, actor.sub);
      return tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          status: dto.status,
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

  async deleteCourse(tenantId: string, actor: JwtPayload, courseId: string) {
    const course = await this.assertWritableCourse(tenantId, actor, courseId);
    if (
      ![TrainingCourseStatus.DRAFT, TrainingCourseStatus.ARCHIVED].some(
        (status) => status === course.status,
      )
    ) {
      throw new ConflictException('Only draft or archived courses can be deleted');
    }
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
        modules: {
          include: { lessons: { include: { blocks: true } } },
        },
      },
    });
    if (!course?.summary?.trim() || !course.description?.trim()) {
      throw new BadRequestException('Summary and description are required before review');
    }
    if (
      course.modules.length === 0 ||
      course.modules.some(
        (module) =>
          module.lessons.length === 0 ||
          module.lessons.some((lesson) => lesson.blocks.length === 0),
      )
    ) {
      throw new BadRequestException('Every course needs modules, lessons and content blocks');
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
