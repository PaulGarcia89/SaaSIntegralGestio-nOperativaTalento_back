import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  NotificationType,
  TrainingAssignmentSourceType,
  TrainingAssignmentType,
  TrainingCourseStatus,
  TrainingProgressStatus,
  UserStatus,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateTrainingAssignmentsDto,
  ListTrainingAdminAssignmentsDto,
  TrainingAssignmentAudience,
} from './dto/training-assignment-admin.dto';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingAssignmentAdminService {
  constructor(private readonly prisma: PrismaService, private readonly webhooks: TrainingWebhookDeliveryService) {}

  async list(tenantId: string, query: ListTrainingAdminAssignmentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const assignedAt = query.assignedFrom || query.assignedTo ? {
      ...(query.assignedFrom ? { gte: new Date(query.assignedFrom) } : {}),
      ...(query.assignedTo ? { lte: new Date(query.assignedTo) } : {}),
    } : undefined;
    const dueAt = query.dueFrom || query.dueTo || query.overdue ? {
      ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
      ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
      ...(query.overdue ? { lt: now } : {}),
    } : undefined;
    const completedAt = query.completedFrom || query.completedTo ? {
      ...(query.completedFrom ? { gte: new Date(query.completedFrom) } : {}),
      ...(query.completedTo ? { lte: new Date(query.completedTo) } : {}),
    } : undefined;
    const where: Prisma.TrainingAssignmentWhereInput = {
      tenantId,
      userId: query.userId,
      courseId: query.courseId,
      status: query.overdue ? { not: TrainingProgressStatus.COMPLETED } : query.status,
      isRequired: query.isRequired,
      createdAt: assignedAt,
      dueAt,
      completedAt,
      ...(query.branchId ? { user: { OR: [{ activeBranchId: query.branchId }, { branchAccesses: { some: { branchId: query.branchId } } }] } } : {}),
      ...(query.search
        ? {
            OR: [
              { course: { title: { contains: query.search, mode: 'insensitive' } } },
              {
                user: {
                  OR: [
                    { firstName: { contains: query.search, mode: 'insensitive' } },
                    { lastName: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, notStarted, inProgress, completed, overdue] =
      await this.prisma.$transaction([
      this.prisma.trainingAssignment.findMany({
        where,
        include: {
          course: { select: { id: true, title: true, coverImageUrl: true } },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              activeBranch: { select: { id: true, name: true } },
            },
          },
          assignedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trainingAssignment.count({ where }),
      this.prisma.trainingAssignment.count({ where: { ...where, status: TrainingProgressStatus.NOT_STARTED } }),
      this.prisma.trainingAssignment.count({ where: { ...where, status: TrainingProgressStatus.IN_PROGRESS } }),
      this.prisma.trainingAssignment.count({ where: { ...where, status: TrainingProgressStatus.COMPLETED } }),
      this.prisma.trainingAssignment.count({
        where: { ...where, dueAt: { ...(dueAt ?? {}), lt: now }, status: { not: TrainingProgressStatus.COMPLETED } },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        effectiveStatus:
          item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED
            ? TrainingProgressStatus.OVERDUE
            : item.status,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      summary: {
        total: notStarted + inProgress + completed,
        notStarted,
        inProgress,
        completed,
        overdue,
      },
    };
  }

  async create(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateTrainingAssignmentsDto,
  ) {
    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (startAt && dueAt && dueAt <= startAt) {
      throw new BadRequestException('Due date must be later than the start date');
    }

    const course = await this.prisma.trainingCourse.findFirst({
      where: {
        id: dto.courseId,
        status: TrainingCourseStatus.PUBLISHED,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { id: true, title: true },
    });
    if (!course) {
      throw new NotFoundException('Published course not found in the active tenant scope');
    }

    const userIds = await this.resolveAudience(tenantId, dto.audience, dto.targetIds ?? []);
    if (userIds.length === 0) {
      throw new BadRequestException('The selected audience does not contain active users');
    }

    const existing = await this.prisma.trainingAssignment.findMany({
      where: { tenantId, courseId: course.id, userId: { in: userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((item) => item.userId));
    const pendingIds = userIds.filter((id) => !existingIds.has(id));

    if (pendingIds.length > 0) {
      await this.prisma.$transaction(
        pendingIds.flatMap((userId) => [
          this.prisma.trainingAssignment.create({
            data: {
              tenantId,
              userId,
              courseId: course.id,
              assignedById: actor.sub,
              assignmentType: TrainingAssignmentType.COURSE,
              sourceType: TrainingAssignmentSourceType.MANUAL,
              startAt,
              dueAt,
              isRequired: dto.isRequired ?? true,
            },
          }),
          this.prisma.trainingProgress.upsert({
            where: { tenantId_userId_courseId: { tenantId, userId, courseId: course.id } },
            update: {},
            create: { tenantId, userId, courseId: course.id },
          }),
          this.prisma.notification.create({
            data: {
              tenantId,
              userId,
              type: NotificationType.INFO,
              title: 'Nuevo curso asignado',
              message: `Se te asignó el curso “${course.title}”${dueAt ? ` con fecha límite ${dueAt.toLocaleDateString('es')}` : ''}.`,
              payload: {
                kind: 'TRAINING_ASSIGNED',
                courseId: course.id,
              },
            },
          }),
        ]),
      );
      await this.webhooks.publish(tenantId, 'course.assigned', {
        courseId: course.id,
        courseTitle: course.title,
        userIds: pendingIds,
        assignedById: actor.sub,
        dueAt: dueAt?.toISOString() ?? null,
      });
    }

    return {
      course,
      requested: userIds.length,
      created: pendingIds.length,
      skipped: existingIds.size,
    };
  }

  async remove(tenantId: string, assignmentId: string) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!assignment) throw new NotFoundException('Training assignment not found');
    if (assignment.status === TrainingProgressStatus.COMPLETED) {
      throw new ConflictException('Completed assignments must remain in the training history');
    }
    await this.prisma.trainingAssignment.delete({ where: { id: assignment.id } });
    return { deleted: true };
  }

  private async resolveAudience(
    tenantId: string,
    audience: TrainingAssignmentAudience,
    targetIds: string[],
  ) {
    if (audience !== TrainingAssignmentAudience.TENANT && targetIds.length === 0) {
      throw new BadRequestException('At least one audience target is required');
    }

    const where: Prisma.UserWhereInput = {
      tenantId,
      status: UserStatus.ACTIVE,
      ...(audience === TrainingAssignmentAudience.USERS
        ? { id: { in: targetIds } }
        : audience === TrainingAssignmentAudience.ROLES
          ? { userRoles: { some: { role: { OR: [{ id: { in: targetIds } }, { code: { in: targetIds } }] } } } }
          : audience === TrainingAssignmentAudience.BRANCHES
            ? {
                OR: [
                  { activeBranchId: { in: targetIds } },
                  { branchAccesses: { some: { branchId: { in: targetIds } } } },
                ],
              }
            : {}),
    };
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    return [...new Set(users.map((item) => item.id))];
  }
}
