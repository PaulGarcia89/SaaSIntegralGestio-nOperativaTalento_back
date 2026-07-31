import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  TrainingAssignmentSourceType,
  TrainingAssignmentType,
  TrainingCourseStatus,
  TrainingLaunchAudience,
  TrainingLaunchStatus,
  TrainingProgressStatus,
  UserStatus,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateTrainingLaunchDto,
  ListTrainingLaunchesDto,
  UpdateTrainingLaunchStatusDto,
} from './dto/training-launch.dto';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingLaunchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrainingLaunchService.name);
  private readonly intervalMs = 60_000;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: TrainingWebhookDeliveryService,
  ) {}

  onModuleInit() {
    void this.processDueLaunches();
    this.timer = setInterval(() => void this.processDueLaunches(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async list(tenantId: string, query: ListTrainingLaunchesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.TrainingLaunchWhereInput = {
      tenantId,
      status: query.status,
      courseId: query.courseId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { course: { title: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trainingLaunch.findMany({
        where,
        include: {
          course: { select: { id: true, title: true, coverImageUrl: true, version: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignments: { select: { status: true, progressPercent: true, dueAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trainingLaunch.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toResponse(item)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(tenantId: string, actor: JwtPayload, dto: CreateTrainingLaunchDto) {
    const now = new Date();
    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (startAt && dueAt && dueAt <= startAt) {
      throw new BadRequestException('Due date must be later than the launch date');
    }
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: dto.courseId, status: TrainingCourseStatus.PUBLISHED, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundException('Published course not found in the active tenant scope');
    const targetIds = [...new Set(dto.targetIds ?? [])];
    const resolvedUserIds = await this.resolveAudience(tenantId, dto.audience, targetIds);
    if (!resolvedUserIds.length) throw new BadRequestException('The selected audience does not contain active users');
    const scheduled = Boolean(startAt && startAt > now);
    const launch = await this.prisma.trainingLaunch.create({
      data: {
        tenantId,
        courseId: course.id,
        createdById: actor.sub,
        name: dto.name.trim(),
        audience: dto.audience,
        targetIds,
        resolvedUserIds,
        batchSize: dto.batchSize ?? 100,
        rolloutIntervalHours: dto.rolloutIntervalHours ?? 0,
        isRequired: dto.isRequired ?? true,
        startAt,
        dueAt,
        status: scheduled ? TrainingLaunchStatus.SCHEDULED : TrainingLaunchStatus.DRAFT,
        nextBatchAt: scheduled ? startAt : null,
      },
      include: { course: { select: { id: true, title: true, version: true } }, assignments: true },
    });
    return this.toResponse(launch);
  }

  async deploy(tenantId: string, launchId: string) {
    const launch = await this.getLaunch(tenantId, launchId);
    const deployableStatuses = new Set<TrainingLaunchStatus>([
      TrainingLaunchStatus.DRAFT,
      TrainingLaunchStatus.SCHEDULED,
      TrainingLaunchStatus.ACTIVE,
    ]);
    if (!deployableStatuses.has(launch.status)) {
      throw new ConflictException('This launch cannot deploy another batch in its current state');
    }
    if (launch.status === TrainingLaunchStatus.SCHEDULED && launch.startAt && launch.startAt > new Date()) {
      throw new ConflictException('This launch is scheduled for a future date');
    }
    return this.deployBatch(launch);
  }

  async updateStatus(tenantId: string, launchId: string, dto: UpdateTrainingLaunchStatusDto) {
    const launch = await this.getLaunch(tenantId, launchId);
    const allowed: Partial<Record<TrainingLaunchStatus, TrainingLaunchStatus[]>> = {
      [TrainingLaunchStatus.SCHEDULED]: [TrainingLaunchStatus.PAUSED, TrainingLaunchStatus.CANCELLED],
      [TrainingLaunchStatus.ACTIVE]: [TrainingLaunchStatus.PAUSED, TrainingLaunchStatus.CANCELLED],
      [TrainingLaunchStatus.PAUSED]: [TrainingLaunchStatus.ACTIVE, TrainingLaunchStatus.CANCELLED],
      [TrainingLaunchStatus.DRAFT]: [TrainingLaunchStatus.CANCELLED],
    };
    if (!allowed[launch.status]?.includes(dto.status)) {
      throw new ConflictException(`Cannot transition launch from ${launch.status} to ${dto.status}`);
    }
    const now = new Date();
    const updated = await this.prisma.trainingLaunch.update({
      where: { id: launch.id },
      data: {
        status: dto.status,
        nextBatchAt: dto.status === TrainingLaunchStatus.ACTIVE ? now : null,
        cancelledAt: dto.status === TrainingLaunchStatus.CANCELLED ? now : undefined,
      },
      include: { course: { select: { id: true, title: true, version: true } }, assignments: { select: { status: true, progressPercent: true, dueAt: true } } },
    });
    return this.toResponse(updated);
  }

  async processDueLaunches(now = new Date(), tenantId?: string) {
    if (this.running) return { skipped: true, processed: 0 };
    this.running = true;
    try {
      const launches = await this.prisma.trainingLaunch.findMany({
        where: {
          tenantId,
          status: { in: [TrainingLaunchStatus.SCHEDULED, TrainingLaunchStatus.ACTIVE] },
          nextBatchAt: { lte: now },
        },
        include: { course: { select: { id: true, title: true, version: true } }, assignments: true },
        take: 50,
      });
      for (const launch of launches) await this.deployBatch(launch);
      return { skipped: false, processed: launches.length };
    } catch (error) {
      this.logger.error('Unable to process scheduled training launches', error);
      if (tenantId) throw error;
      return { skipped: false, processed: 0, failed: true };
    } finally {
      this.running = false;
    }
  }

  private async deployBatch(launch: Awaited<ReturnType<TrainingLaunchService['getLaunch']>>) {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 10 * 60_000);
    const claim = await this.prisma.trainingLaunch.updateMany({
      where: {
        id: launch.id,
        nextAudienceIndex: launch.nextAudienceIndex,
        status: { in: [TrainingLaunchStatus.DRAFT, TrainingLaunchStatus.SCHEDULED, TrainingLaunchStatus.ACTIVE] },
        OR: [{ processingAt: null }, { processingAt: { lt: staleAt } }],
      },
      data: { processingAt: now },
    });
    if (!claim.count) return this.getLaunchResponse(launch.tenantId, launch.id);
    const end = Math.min(launch.nextAudienceIndex + launch.batchSize, launch.resolvedUserIds.length);
    const batch = launch.resolvedUserIds.slice(launch.nextAudienceIndex, end);
    if (!batch.length) return this.completeLaunch(launch.id);
    try {
      const existing = await this.prisma.trainingAssignment.findMany({
        where: { tenantId: launch.tenantId, courseId: launch.courseId, userId: { in: batch } },
        select: { userId: true },
      });
      const existingIds = new Set(existing.map((item) => item.userId));
      const pending = batch.filter((userId) => !existingIds.has(userId));
      const completed = end >= launch.resolvedUserIds.length;
      const nextBatchAt = completed
        ? null
        : new Date(now.getTime() + launch.rolloutIntervalHours * 3_600_000);
      await this.prisma.$transaction(async (tx) => {
        if (pending.length) {
          await tx.trainingAssignment.createMany({
            data: pending.map((userId) => ({
              tenantId: launch.tenantId,
              userId,
              courseId: launch.courseId,
              launchId: launch.id,
              assignedById: launch.createdById,
              assignmentType: TrainingAssignmentType.COURSE,
              sourceType: TrainingAssignmentSourceType.CAMPAIGN,
              startAt: launch.startAt,
              dueAt: launch.dueAt,
              isRequired: launch.isRequired,
            })),
            skipDuplicates: true,
          });
          await tx.trainingProgress.createMany({
            data: pending.map((userId) => ({ tenantId: launch.tenantId, userId, courseId: launch.courseId })),
            skipDuplicates: true,
          });
          await tx.notification.createMany({
            data: pending.map((userId) => ({
              tenantId: launch.tenantId,
              userId,
              type: NotificationType.INFO,
              title: 'Nuevo curso asignado',
              message: `Se te asignó el curso “${launch.course.title}”${launch.dueAt ? ` con fecha límite ${launch.dueAt.toLocaleDateString('es')}` : ''}.`,
              payload: { kind: 'TRAINING_LAUNCH_ASSIGNED', launchId: launch.id, courseId: launch.courseId },
            })),
          });
        }
        await tx.trainingLaunch.update({
          where: { id: launch.id },
          data: {
            status: completed ? TrainingLaunchStatus.COMPLETED : TrainingLaunchStatus.ACTIVE,
            nextAudienceIndex: end,
            nextBatchAt,
            processingAt: null,
            launchedAt: launch.launchedAt ?? now,
            completedAt: completed ? now : null,
          },
        });
      });
      if (pending.length) {
        await this.webhooks.publish(launch.tenantId, 'course.launch.batch', {
          launchId: launch.id,
          courseId: launch.courseId,
          userIds: pending,
          batchStart: launch.nextAudienceIndex,
          batchEnd: end,
        });
      }
      return this.getLaunchResponse(launch.tenantId, launch.id);
    } catch (error) {
      await this.prisma.trainingLaunch.updateMany({
        where: { id: launch.id, processingAt: now },
        data: { processingAt: null },
      });
      throw error;
    }
  }

  private async completeLaunch(id: string) {
    await this.prisma.trainingLaunch.update({
      where: { id },
      data: { status: TrainingLaunchStatus.COMPLETED, completedAt: new Date(), nextBatchAt: null, processingAt: null },
    });
    const launch = await this.prisma.trainingLaunch.findUniqueOrThrow({
      where: { id },
      include: { course: { select: { id: true, title: true, version: true } }, assignments: { select: { status: true, progressPercent: true, dueAt: true } } },
    });
    return this.toResponse(launch);
  }

  private async getLaunch(tenantId: string, id: string) {
    const launch = await this.prisma.trainingLaunch.findFirst({
      where: { id, tenantId },
      include: { course: { select: { id: true, title: true, version: true } }, assignments: { select: { status: true, progressPercent: true, dueAt: true } } },
    });
    if (!launch) throw new NotFoundException('Training launch not found');
    return launch;
  }

  private async getLaunchResponse(tenantId: string, id: string) {
    return this.toResponse(await this.getLaunch(tenantId, id));
  }

  private toResponse<T extends { resolvedUserIds: string[]; nextAudienceIndex: number; assignments: Array<{ status: TrainingProgressStatus; progressPercent: number; dueAt: Date | null }> }>(launch: T) {
    const now = new Date();
    const assigned = launch.assignments.length;
    const started = launch.assignments.filter((item) => item.status !== TrainingProgressStatus.NOT_STARTED).length;
    const completed = launch.assignments.filter((item) => item.status === TrainingProgressStatus.COMPLETED).length;
    const overdue = launch.assignments.filter((item) => item.status !== TrainingProgressStatus.COMPLETED && item.dueAt && item.dueAt < now).length;
    const averageProgress = assigned ? Math.round(launch.assignments.reduce((sum, item) => sum + item.progressPercent, 0) / assigned) : 0;
    return {
      ...launch,
      assignments: undefined,
      metrics: {
        audience: launch.resolvedUserIds.length,
        processed: launch.nextAudienceIndex,
        assigned,
        started,
        completed,
        overdue,
        averageProgress,
      },
    };
  }

  private async resolveAudience(tenantId: string, audience: TrainingLaunchAudience, targetIds: string[]) {
    if (audience !== TrainingLaunchAudience.TENANT && !targetIds.length) {
      throw new BadRequestException('At least one audience target is required');
    }
    const where: Prisma.UserWhereInput = {
      tenantId,
      status: UserStatus.ACTIVE,
      ...(audience === TrainingLaunchAudience.USERS
        ? { id: { in: targetIds } }
        : audience === TrainingLaunchAudience.ROLES
          ? { userRoles: { some: { role: { OR: [{ id: { in: targetIds } }, { code: { in: targetIds } }] } } } }
          : audience === TrainingLaunchAudience.BRANCHES
            ? { OR: [{ activeBranchId: { in: targetIds } }, { branchAccesses: { some: { branchId: { in: targetIds } } } }] }
            : {}),
    };
    const users = await this.prisma.user.findMany({ where, select: { id: true }, orderBy: { createdAt: 'asc' } });
    return [...new Set(users.map((item) => item.id))];
  }
}
