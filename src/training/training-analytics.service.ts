import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TrainingProgressStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  TrainingAnalyticsQueryDto,
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
}
