import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, TrainingAssignmentSourceType, TrainingAssignmentType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AddTrainingPathCourseDto, CreateTrainingLearningPathDto, CreateTrainingOnboardingRuleDto } from './dto/training-learning-path.dto';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingLearningPathService {
  constructor(private readonly prisma: PrismaService, private readonly webhooks: TrainingWebhookDeliveryService) {}

  list(tenantId: string) {
    return this.prisma.trainingCurriculum.findMany({
      where: { tenantId }, include: { category: true, pathCourses: { include: { course: true, prerequisiteCourse: { select: { id: true, title: true } } }, orderBy: { sortOrder: 'asc' } }, _count: { select: { assignments: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateTrainingLearningPathDto) {
    const slug = this.slug(dto.title);
    return this.prisma.trainingCurriculum.create({ data: { tenantId, title: dto.title.trim(), slug, description: dto.description?.trim(), objective: dto.objective?.trim(), targetAudience: dto.targetAudience?.trim(), isPublished: dto.isPublished ?? false } }).catch(error => {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('A learning path with this title already exists');
      throw error;
    });
  }

  async addCourse(tenantId: string, pathId: string, dto: AddTrainingPathCourseDto) {
    const [path, course, prerequisite] = await Promise.all([
      this.prisma.trainingCurriculum.findFirst({ where: { id: pathId, tenantId } }),
      this.prisma.trainingCourse.findFirst({ where: { id: dto.courseId, OR: [{ tenantId }, { tenantId: null }] } }),
      dto.prerequisiteCourseId ? this.prisma.trainingCourse.findFirst({ where: { id: dto.prerequisiteCourseId, OR: [{ tenantId }, { tenantId: null }] } }) : Promise.resolve(null),
    ]);
    if (!path || !course || (dto.prerequisiteCourseId && !prerequisite)) throw new NotFoundException('Learning path, course or prerequisite not found');
    if (dto.courseId === dto.prerequisiteCourseId) throw new BadRequestException('A course cannot depend on itself');
    if (dto.prerequisiteCourseId) {
      const belongs = await this.prisma.trainingPathCourse.count({ where: { curriculumId: pathId, courseId: dto.prerequisiteCourseId } });
      if (!belongs) throw new BadRequestException('The prerequisite must be an earlier course in the same path');
    }
    return this.prisma.trainingPathCourse.upsert({
      where: { curriculumId_courseId: { curriculumId: pathId, courseId: dto.courseId } },
      create: { tenantId, curriculumId: pathId, courseId: dto.courseId, prerequisiteCourseId: dto.prerequisiteCourseId, sortOrder: dto.sortOrder ?? 0, isRequired: dto.isRequired ?? true, unlockAfterDays: dto.unlockAfterDays },
      update: { prerequisiteCourseId: dto.prerequisiteCourseId ?? null, sortOrder: dto.sortOrder, isRequired: dto.isRequired, unlockAfterDays: dto.unlockAfterDays },
      include: { course: true, prerequisiteCourse: { select: { id: true, title: true } } },
    });
  }

  removeCourse(tenantId: string, pathId: string, courseId: string) {
    return this.prisma.trainingPathCourse.deleteMany({ where: { tenantId, curriculumId: pathId, courseId } });
  }

  listRules(tenantId: string) {
    return this.prisma.trainingOnboardingRule.findMany({ where: { tenantId }, include: { onboardingTemplate: { select: { id: true, name: true, version: true } }, branch: { select: { id: true, name: true } }, curriculum: { select: { id: true, title: true } }, course: { select: { id: true, title: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async createRule(tenantId: string, actorId: string, dto: CreateTrainingOnboardingRuleDto) {
    if (Boolean(dto.curriculumId) === Boolean(dto.courseId)) throw new BadRequestException('Select exactly one course or learning path');
    const [template, branch, curriculum, course] = await Promise.all([
      dto.onboardingTemplateId ? this.prisma.onboardingTemplate.findFirst({ where: { id: dto.onboardingTemplateId, tenantId } }) : Promise.resolve(true),
      dto.branchId ? this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } }) : Promise.resolve(true),
      dto.curriculumId ? this.prisma.trainingCurriculum.findFirst({ where: { id: dto.curriculumId, tenantId } }) : Promise.resolve(true),
      dto.courseId ? this.prisma.trainingCourse.findFirst({ where: { id: dto.courseId, OR: [{ tenantId }, { tenantId: null }] } }) : Promise.resolve(true),
    ]);
    if (!template || !branch || !curriculum || !course) throw new NotFoundException('One or more rule resources do not exist');
    return this.prisma.trainingOnboardingRule.create({ data: { tenantId, createdById: actorId, ...dto, name: dto.name.trim(), jobTitlePattern: dto.jobTitlePattern?.trim(), roleCode: dto.roleCode?.trim().toUpperCase() } });
  }

  async deleteRule(tenantId: string, id: string) {
    const result = await this.prisma.trainingOnboardingRule.deleteMany({ where: { id, tenantId } });
    if (!result.count) throw new NotFoundException('Onboarding training rule not found');
    return { deleted: true };
  }

  async assignForOnboarding(tenantId: string, flowId: string, templateId: string) {
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId }, include: { employee: true } });
    if (!flow) return { assigned: 0 };
    const user = await this.prisma.user.findFirst({ where: { tenantId, email: { equals: flow.employee.email, mode: 'insensitive' }, status: 'ACTIVE' }, include: { userRoles: { include: { role: true } } } });
    if (!user) return { assigned: 0, reason: 'EMPLOYEE_USER_NOT_FOUND' };
    const rules = await this.prisma.trainingOnboardingRule.findMany({ where: { tenantId, isActive: true, AND: [
      { OR: [{ onboardingTemplateId: null }, { onboardingTemplateId: templateId }] },
      { OR: [{ branchId: null }, { branchId: flow.branchId }] },
    ] } });
    const normalizedJobTitle = (flow.employee.jobTitle ?? '').toLocaleLowerCase();
    const matching = rules.filter(rule =>
      (!rule.jobTitlePattern || normalizedJobTitle.includes(rule.jobTitlePattern.toLocaleLowerCase()))
      && (!rule.roleCode || user.userRoles.some(item => item.role.code === rule.roleCode)),
    );
    let assigned = 0;
    for (const rule of matching) {
      const dueAt = new Date(Date.now() + rule.dueDays * 86_400_000);
      const unique = rule.courseId ? { tenantId_userId_courseId: { tenantId, userId: user.id, courseId: rule.courseId } } : { tenantId_userId_curriculumId: { tenantId, userId: user.id, curriculumId: rule.curriculumId! } };
      const existing = rule.courseId
        ? await this.prisma.trainingAssignment.findUnique({ where: unique as Prisma.TrainingAssignmentWhereUniqueInput })
        : await this.prisma.trainingAssignment.findUnique({ where: unique as Prisma.TrainingAssignmentWhereUniqueInput });
      if (existing) continue;
      await this.prisma.$transaction(async tx => {
        await tx.trainingAssignment.create({ data: { tenantId, userId: user.id, courseId: rule.courseId, curriculumId: rule.curriculumId, assignedById: rule.createdById, assignmentType: rule.courseId ? TrainingAssignmentType.COURSE : TrainingAssignmentType.CURRICULUM, sourceType: TrainingAssignmentSourceType.ONBOARDING, isRequired: rule.isRequired, startAt: new Date(), dueAt } });
        await tx.trainingProgress.create({ data: { tenantId, userId: user.id, courseId: rule.courseId, curriculumId: rule.curriculumId } });
        await tx.notification.create({ data: { tenantId, userId: user.id, type: NotificationType.INFO, title: 'Formación asignada desde tu incorporación', message: `Tienes una nueva ${rule.courseId ? 'formación' : 'ruta de aprendizaje'} con fecha límite.`, payload: { kind: 'ONBOARDING_TRAINING_ASSIGNED', flowId, courseId: rule.courseId, curriculumId: rule.curriculumId, dueAt: dueAt.toISOString() } } });
      });
      await this.webhooks.publish(tenantId, 'training.onboarding_assigned', { flowId, userId: user.id, courseId: rule.courseId, curriculumId: rule.curriculumId, dueAt: dueAt.toISOString() });
      assigned += 1;
    }
    return { assigned };
  }

  private slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
}
