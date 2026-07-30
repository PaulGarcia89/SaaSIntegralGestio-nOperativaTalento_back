import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplyOnboardingTemplateDto, CreateOnboardingTemplateDto, ReviewEmployeeDocumentDto, UpdateOnboardingTaskDto } from './dto/onboarding.dto';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { TrainingLearningPathService } from '../training/training-learning-path.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService, private readonly antivirus: TrainingAntivirusService, private readonly learningPaths: TrainingLearningPathService) {}

  listTemplates(tenantId: string) {
    return this.prisma.onboardingTemplate.findMany({
      where: { tenantId, isActive: true },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createTemplate(tenantId: string, actorId: string, dto: CreateOnboardingTemplateDto) {
    this.validateDependencies(dto.tasks);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.onboardingTemplate.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
      const latest = await tx.onboardingTemplate.findFirst({ where: { tenantId, name: dto.name }, orderBy: { version: 'desc' } });
      return tx.onboardingTemplate.create({
        data: {
          tenantId, name: dto.name.trim(), description: dto.description?.trim(), version: (latest?.version ?? 0) + 1,
          isDefault: dto.isDefault ?? false, createdById: actorId,
          tasks: { create: dto.tasks.map((task, index) => ({
            tenantId, taskKey: task.taskKey.trim(), taskType: task.taskType, title: task.title.trim(),
            description: task.description?.trim(), ownerType: task.ownerType, ownerId: task.ownerId,
            dueOffsetDays: task.dueOffsetDays, dependsOnKeys: task.dependsOnKeys ?? [], required: task.required ?? true,
            sortOrder: task.sortOrder ?? index,
          })) },
        },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async listFlows(tenantId: string, branchId?: string) {
    const flows = await this.prisma.onboardingFlow.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        employee: { select: { id: true, name: true, email: true, jobTitle: true, supervisorUserId: true } },
        branch: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        tasks: { orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], include: { documents: { select: { id: true, status: true } } } },
        documents: { orderBy: { createdAt: 'desc' } },
        signaturePackages: { select: { id: true, title: true, status: true, dueDate: true, signedAt: true, participants: { select: { id: true, fullName: true, status: true } } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: flows.map((flow) => this.decorateFlow(flow)) };
  }

  async getFlow(tenantId: string, id: string) {
    const flow = await this.prisma.onboardingFlow.findFirst({
      where: { id, tenantId },
      include: {
        employee: { select: { id: true, name: true, email: true, jobTitle: true, supervisorUserId: true } },
        branch: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        tasks: { orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], include: { documents: { select: { id: true, status: true } } } },
        documents: { orderBy: { createdAt: 'desc' } },
        signaturePackages: { select: { id: true, title: true, status: true, dueDate: true, signedAt: true, participants: { select: { id: true, fullName: true, status: true } } }, orderBy: { createdAt: 'desc' } },
        workflow: { include: { operationalEvents: { orderBy: { occurredAt: 'desc' }, take: 50 } } },
      },
    });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    return this.decorateFlow(flow);
  }

  async applyTemplate(tenantId: string, flowId: string, dto: ApplyOnboardingTemplateDto) {
    const [flow, template] = await Promise.all([
      this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId } }),
      this.prisma.onboardingTemplate.findFirst({ where: { id: dto.templateId, tenantId, isActive: true }, include: { tasks: true } }),
    ]);
    if (!flow || !template) throw new NotFoundException('Onboarding flow or template not found');
    const start = dto.startDate ? new Date(dto.startDate) : flow.startedAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.deleteMany({ where: { onboardingFlowId: flow.id, status: WorkflowTaskStatus.PENDING } });
      for (const task of template.tasks) {
        const dueDate = task.dueOffsetDays == null ? null : new Date(start.getTime() + task.dueOffsetDays * 86_400_000);
        await tx.onboardingTask.upsert({
          where: { onboardingFlowId_taskKey: { onboardingFlowId: flow.id, taskKey: task.taskKey } },
          update: { title: task.title, description: task.description, ownerType: task.ownerType, ownerId: task.ownerId, dueDate, dependsOnKeys: task.dependsOnKeys ?? [] },
          create: { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, onboardingFlowId: flow.id, employeeId: flow.employeeId, taskKey: task.taskKey, taskType: task.taskType, title: task.title, description: task.description, ownerType: task.ownerType, ownerId: task.ownerId, dueDate, dependsOnKeys: task.dependsOnKeys ?? [] },
        });
      }
      await tx.onboardingFlow.update({ where: { id: flow.id }, data: { templateId: template.id, status: WorkflowTaskStatus.IN_PROGRESS } });
    });
    await this.learningPaths.assignForOnboarding(tenantId, flow.id, template.id);
    return this.getFlow(tenantId, flowId);
  }

  async updateTask(tenantId: string, taskId: string, dto: UpdateOnboardingTaskDto) {
    const task = await this.prisma.onboardingTask.findFirst({ where: { id: taskId, tenantId }, include: { onboardingFlow: { include: { tasks: true } } } });
    if (!task) throw new NotFoundException('Onboarding task not found');
    if (dto.status === WorkflowTaskStatus.COMPLETED) {
      const dependencies = this.stringArray(task.dependsOnKeys);
      const incomplete = task.onboardingFlow.tasks.filter((candidate) => dependencies.includes(candidate.taskKey) && candidate.status !== WorkflowTaskStatus.COMPLETED);
      if (incomplete.length) throw new ConflictException(`Complete dependencies first: ${incomplete.map((item) => item.title).join(', ')}`);
    }
    await this.prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        status: dto.status, progressPercent: dto.status === WorkflowTaskStatus.COMPLETED ? 100 : dto.progressPercent,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, ownerType: dto.ownerType, ownerId: dto.ownerId,
        blockingReason: dto.blockingReason === '' ? null : dto.blockingReason,
        completedAt: dto.status === WorkflowTaskStatus.COMPLETED ? new Date() : dto.status ? null : undefined,
      },
    });
    await this.recomputeFlow(task.onboardingFlowId);
    return this.getFlow(tenantId, task.onboardingFlowId);
  }

  async uploadDocument(tenantId: string, actorId: string, flowId: string, taskId: string | undefined, category: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A document is required');
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    if (taskId) {
      const belongs = await this.prisma.onboardingTask.count({ where: { id: taskId, onboardingFlowId: flowId, tenantId } });
      if (!belongs) throw new BadRequestException('Task does not belong to onboarding flow');
    }
    const scan = await this.antivirus.scan(file.buffer);
    const stored = await this.storage.store(tenantId, flow.employeeId, file);
    return this.prisma.employeeDocument.create({
      data: {
        tenantId, branchId: flow.branchId, employeeId: flow.employeeId, onboardingFlowId: flow.id, taskId,
        category: category || 'OTHER', originalName: file.originalname, storageKey: stored.key, mimeType: file.mimetype,
        sizeBytes: file.size, checksum: stored.checksum, scanStatus: scan.status,
        uploadedById: actorId,
      },
    });
  }

  async downloadDocument(tenantId: string, id: string) {
    const document = await this.prisma.employeeDocument.findFirst({ where: { id, tenantId } });
    if (!document) throw new NotFoundException('Document not found');
    return { document, buffer: await this.storage.read(document.storageKey) };
  }

  async reviewDocument(tenantId: string, actorId: string, id: string, dto: ReviewEmployeeDocumentDto) {
    const result = await this.prisma.employeeDocument.updateMany({
      where: { id, tenantId },
      data: { status: dto.status, reviewedAt: new Date(), reviewedById: actorId },
    });
    if (!result.count) throw new NotFoundException('Document not found');
    return this.prisma.employeeDocument.findUnique({ where: { id } });
  }

  private decorateFlow<T extends { tasks: Array<{ taskKey: string; status: WorkflowTaskStatus; dueDate: Date | null; blockingReason: string | null; dependsOnKeys: Prisma.JsonValue | null }> }>(flow: T) {
    const now = Date.now();
    const completed = new Set(flow.tasks.filter((task) => task.status === WorkflowTaskStatus.COMPLETED).map((task) => task.taskKey));
    const tasks = flow.tasks.map((task) => {
      const dependencies = this.stringArray(task.dependsOnKeys);
      const waitingFor = dependencies.filter((key) => !completed.has(key));
      return { ...task, waitingFor, blocked: Boolean(task.blockingReason || waitingFor.length), overdue: Boolean(task.dueDate && task.dueDate.getTime() < now && task.status !== WorkflowTaskStatus.COMPLETED) };
    });
    const nextAction = tasks.find((task) => task.status !== WorkflowTaskStatus.COMPLETED && !task.blocked) ?? null;
    return {
      ...flow, tasks, nextAction,
      alerts: tasks.filter((task) => task.overdue || task.blockingReason).map((task) => ({ taskId: task.taskKey, severity: task.overdue ? 'danger' : 'warning', message: task.overdue ? `${'title' in task ? task.title : task.taskKey} está vencida` : task.blockingReason })),
      progressPercent: tasks.length ? Math.round((tasks.filter((task) => task.status === WorkflowTaskStatus.COMPLETED).length / tasks.length) * 100) : 0,
    };
  }

  private async recomputeFlow(flowId: string) {
    const tasks = await this.prisma.onboardingTask.findMany({ where: { onboardingFlowId: flowId } });
    const allDone = tasks.length > 0 && tasks.every((task) => task.status === WorkflowTaskStatus.COMPLETED);
    await this.prisma.onboardingFlow.update({ where: { id: flowId }, data: { status: allDone ? WorkflowTaskStatus.COMPLETED : WorkflowTaskStatus.IN_PROGRESS, completedAt: allDone ? new Date() : null, readinessStatus: allDone ? 'READY' : 'IN_PROGRESS' } });
  }

  private validateDependencies(tasks: CreateOnboardingTemplateDto['tasks']) {
    const keys = new Set(tasks.map((task) => task.taskKey));
    if (keys.size !== tasks.length) throw new BadRequestException('Task keys must be unique');
    for (const task of tasks) {
      if ((task.dependsOnKeys ?? []).includes(task.taskKey)) throw new BadRequestException(`Task ${task.taskKey} cannot depend on itself`);
      for (const dependency of task.dependsOnKeys ?? []) if (!keys.has(dependency)) throw new BadRequestException(`Unknown dependency ${dependency}`);
    }
  }

  private stringArray(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}
