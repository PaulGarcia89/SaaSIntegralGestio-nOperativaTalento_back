import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationalEventType, Prisma, UserStatus, WorkflowOwnerType, WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ApplyOnboardingTemplateDto, CreateOnboardingTemplateDto, OnboardingTemplateTaskDto, ReorderOnboardingTasksDto, ReviewEmployeeDocumentDto, UpdateEmployeeDocumentLifecycleDto, UpdateOnboardingTaskDto, UpdateOnboardingTemplateStatusDto } from './dto/onboarding.dto';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { TrainingLearningPathService } from '../training/training-learning-path.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService, private readonly antivirus: TrainingAntivirusService, private readonly learningPaths: TrainingLearningPathService) {}

  listTemplates(tenantId: string) {
    return this.prisma.onboardingTemplate.findMany({
      where: { tenantId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async getContext(tenantId: string, actor: JwtPayload, branchId?: string) {
    if (branchId) this.assertActorCanAccessBranch(actor, branchId);
    const effectiveBranchIds = branchId
      ? [branchId]
      : actor.scope === AccessScope.BRANCH
        ? actor.allowedBranchIds
        : [];
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ACTIVE,
        ...(effectiveBranchIds.length
          ? {
              OR: [
                { activeBranchId: { in: effectiveBranchIds } },
                { branchAccesses: { some: { branchId: { in: effectiveBranchIds } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        activeBranchId: true,
        userRoles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return {
      assignableUsers: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
        activeBranchId: user.activeBranchId,
        roles: user.userRoles.map(({ role }) => ({ code: role.code, name: role.name })),
      })),
    };
  }

  async createTemplate(tenantId: string, actorId: string, dto: CreateOnboardingTemplateDto) {
    this.validateDependencies(dto.tasks);
    await this.validateOwners(tenantId, dto.tasks);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.onboardingTemplate.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
      const latest = await tx.onboardingTemplate.findFirst({ where: { tenantId, name: dto.name }, orderBy: { version: 'desc' } });
      return tx.onboardingTemplate.create({
        data: {
          tenantId, name: dto.name.trim(), description: dto.description?.trim(), version: (latest?.version ?? 0) + 1,
          isDefault: dto.isDefault ?? false, createdById: actorId,
          tasks: { create: dto.tasks.map((task, index) => ({
            tenantId, taskKey: task.taskKey.trim(), taskType: task.taskType, title: task.title.trim(),
            description: task.description?.trim(), ownerType: task.ownerType ?? WorkflowOwnerType.SYSTEM, ownerId: task.ownerId,
            dueOffsetDays: task.dueOffsetDays, dependsOnKeys: task.dependsOnKeys ?? [], required: task.required ?? true,
            sortOrder: task.sortOrder ?? index,
          })) },
        },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async updateTemplateStatus(tenantId: string, actorId: string, id: string, dto: UpdateOnboardingTemplateStatusDto) {
    const template = await this.prisma.onboardingTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Onboarding template not found');
    if (dto.isDefault && dto.isActive === false) throw new BadRequestException('An inactive template cannot be default');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.onboardingTemplate.updateMany({ where: { tenantId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.onboardingTemplate.update({
        where: { id },
        data: { isActive: dto.isActive, isDefault: dto.isActive === false ? false : dto.isDefault },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async listFlows(tenantId: string, actor: JwtPayload, filters: { branchId?: string; search?: string; status?: string; page?: number; pageSize?: number } = {}) {
    if (filters.branchId) this.assertActorCanAccessBranch(actor, filters.branchId);
    const page = Number.isFinite(filters.page) && (filters.page ?? 0) > 0 ? Math.floor(filters.page!) : 1;
    const pageSize = Number.isFinite(filters.pageSize) ? Math.min(100, Math.max(1, Math.floor(filters.pageSize!))) : 20;
    const status = filters.status && Object.values(WorkflowTaskStatus).includes(filters.status as WorkflowTaskStatus) ? filters.status as WorkflowTaskStatus : undefined;
    const where: Prisma.OnboardingFlowWhereInput = {
      tenantId,
      ...this.branchScope(actor),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(status ? { status } : {}),
      ...(filters.search?.trim() ? { employee: { OR: [
        { name: { contains: filters.search.trim(), mode: 'insensitive' } },
        { email: { contains: filters.search.trim(), mode: 'insensitive' } },
        { jobTitle: { contains: filters.search.trim(), mode: 'insensitive' } },
      ] } } : {}),
    };
    const [flows, total] = await this.prisma.$transaction([
      this.prisma.onboardingFlow.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, email: true, jobTitle: true, supervisorUserId: true } },
        branch: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        tasks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { documents: { where: { deletedAt: null }, select: { id: true, status: true } } } },
        documents: { where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { version: 'desc' }] },
        signaturePackages: { select: { id: true, title: true, status: true, dueDate: true, signedAt: true, participants: { select: { id: true, fullName: true, status: true } } }, orderBy: { createdAt: 'desc' } },
        workflow: { include: { operationalEvents: { orderBy: { occurredAt: 'desc' }, take: 50, include: { actorUser: { select: { id: true, firstName: true, lastName: true, email: true } } } } } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
      this.prisma.onboardingFlow.count({ where }),
    ]);
    return { items: await this.decorateFlows(tenantId, flows), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getFlow(tenantId: string, id: string, actor: JwtPayload) {
    const flow = await this.prisma.onboardingFlow.findFirst({
      where: { id, tenantId, ...this.branchScope(actor) },
      include: {
        employee: { select: { id: true, name: true, email: true, jobTitle: true, supervisorUserId: true } },
        branch: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        tasks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { documents: { where: { deletedAt: null }, select: { id: true, status: true } } } },
        documents: { where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { version: 'desc' }] },
        signaturePackages: { select: { id: true, title: true, status: true, dueDate: true, signedAt: true, participants: { select: { id: true, fullName: true, status: true } } }, orderBy: { createdAt: 'desc' } },
        workflow: { include: { operationalEvents: { orderBy: { occurredAt: 'desc' }, take: 50, include: { actorUser: { select: { id: true, firstName: true, lastName: true, email: true } } } } } },
      },
    });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    return (await this.decorateFlows(tenantId, [flow]))[0];
  }

  async applyTemplate(tenantId: string, flowId: string, actor: JwtPayload, dto: ApplyOnboardingTemplateDto) {
    const [flow, template] = await Promise.all([
      this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId, ...this.branchScope(actor) } }),
      this.prisma.onboardingTemplate.findFirst({ where: { id: dto.templateId, tenantId, isActive: true }, include: { tasks: true } }),
    ]);
    if (!flow || !template) throw new NotFoundException('Onboarding flow or template not found');
    await this.validateOwners(tenantId, template.tasks, flow.branchId);
    const start = dto.startDate ? new Date(dto.startDate) : flow.startedAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.deleteMany({ where: { onboardingFlowId: flow.id, status: WorkflowTaskStatus.PENDING } });
      for (const task of template.tasks) {
        const dueDate = task.dueOffsetDays == null ? null : new Date(start.getTime() + task.dueOffsetDays * 86_400_000);
        await tx.onboardingTask.upsert({
          where: { onboardingFlowId_taskKey: { onboardingFlowId: flow.id, taskKey: task.taskKey } },
          update: { title: task.title, description: task.description, taskType: task.taskType, ownerType: task.ownerType, ownerId: task.ownerId, dueDate, dependsOnKeys: task.dependsOnKeys ?? [], required: task.required, sortOrder: task.sortOrder },
          create: { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, onboardingFlowId: flow.id, employeeId: flow.employeeId, taskKey: task.taskKey, taskType: task.taskType, title: task.title, description: task.description, ownerType: task.ownerType, ownerId: task.ownerId, dueDate, dependsOnKeys: task.dependsOnKeys ?? [], required: task.required, sortOrder: task.sortOrder },
        });
      }
      await tx.onboardingFlow.update({ where: { id: flow.id }, data: { templateId: template.id, status: WorkflowTaskStatus.IN_PROGRESS } });
      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: flow.branchId,
        workflowId: flow.workflowId,
        actorUserId: actor.sub,
        title: 'Plantilla de incorporación aplicada',
        description: `${template.name} v${template.version} inició el checklist operativo.`,
        payload: { kind: 'TEMPLATE_APPLIED', flowId, templateId: template.id },
      });
    });
    await this.learningPaths.assignForOnboarding(tenantId, flow.id, template.id);
    return this.getFlow(tenantId, flowId, actor);
  }

  async updateTask(tenantId: string, taskId: string, actor: JwtPayload, dto: UpdateOnboardingTaskDto) {
    const task = await this.prisma.onboardingTask.findFirst({ where: { id: taskId, tenantId }, include: { onboardingFlow: { include: { tasks: true } } } });
    if (!task) throw new NotFoundException('Onboarding task not found');
    this.assertActorCanAccessBranch(actor, task.branchId);
    if (dto.ownerType !== undefined || dto.ownerId !== undefined) {
      await this.validateOwner(tenantId, dto.ownerType ?? task.ownerType, dto.ownerId ?? task.ownerId, task.branchId);
    }
    if (dto.dependsOnKeys) {
      this.validateRuntimeDependencies(task.taskKey, dto.dependsOnKeys, task.onboardingFlow.tasks);
    }
    if (dto.status === WorkflowTaskStatus.COMPLETED) {
      const dependencies = this.stringArray(task.dependsOnKeys);
      const incomplete = task.onboardingFlow.tasks.filter((candidate) => dependencies.includes(candidate.taskKey) && candidate.status !== WorkflowTaskStatus.COMPLETED);
      if (incomplete.length) throw new ConflictException(`Complete dependencies first: ${incomplete.map((item) => item.title).join(', ')}`);
    }
    if (task.status === WorkflowTaskStatus.COMPLETED && dto.status && dto.status !== WorkflowTaskStatus.COMPLETED) {
      const completedDependents = task.onboardingFlow.tasks.filter((candidate) =>
        candidate.status === WorkflowTaskStatus.COMPLETED &&
        this.stringArray(candidate.dependsOnKeys).includes(task.taskKey),
      );
      if (completedDependents.length) {
        throw new ConflictException(`Reopen dependent tasks first: ${completedDependents.map((item) => item.title).join(', ')}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.update({
        where: { id: task.id },
        data: {
          status: dto.status, progressPercent: dto.status === WorkflowTaskStatus.COMPLETED ? 100 : dto.progressPercent,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, ownerType: dto.ownerType, ownerId: dto.ownerType && dto.ownerType !== WorkflowOwnerType.USER ? null : dto.ownerId,
          blockingReason: dto.blockingReason === '' ? null : dto.blockingReason,
          title: dto.title?.trim(), description: dto.description?.trim(), taskType: dto.taskType,
          dependsOnKeys: dto.dependsOnKeys, required: dto.required, sortOrder: dto.sortOrder,
          completedAt: dto.status === WorkflowTaskStatus.COMPLETED ? new Date() : dto.status ? null : undefined,
        },
      });
      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: task.branchId,
        workflowId: task.workflowId,
        actorUserId: actor.sub,
        title: dto.status === WorkflowTaskStatus.COMPLETED ? 'Tarea de incorporación completada' : 'Tarea de incorporación actualizada',
        description: task.title,
        payload: {
          kind: 'TASK_UPDATED',
          flowId: task.onboardingFlowId,
          taskId: task.id,
          taskKey: task.taskKey,
          status: dto.status ?? task.status,
          ownerId: dto.ownerId ?? task.ownerId,
          dueDate: dto.dueDate ?? task.dueDate?.toISOString() ?? null,
        },
      });
    });
    await this.recomputeFlow(task.onboardingFlowId, actor.sub);
    return this.getFlow(tenantId, task.onboardingFlowId, actor);
  }

  async createTask(tenantId: string, flowId: string, actor: JwtPayload, dto: OnboardingTemplateTaskDto) {
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId, ...this.branchScope(actor) }, include: { tasks: true } });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    this.validateRuntimeDependencies(dto.taskKey, dto.dependsOnKeys ?? [], flow.tasks);
    await this.validateOwner(tenantId, dto.ownerType ?? WorkflowOwnerType.SYSTEM, dto.ownerId, flow.branchId);
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.create({ data: {
        tenantId, branchId: flow.branchId, workflowId: flow.workflowId, onboardingFlowId: flow.id, employeeId: flow.employeeId,
        taskKey: dto.taskKey.trim(), taskType: dto.taskType, title: dto.title.trim(), description: dto.description?.trim(),
        ownerType: dto.ownerType ?? WorkflowOwnerType.SYSTEM, ownerId: dto.ownerId, dependsOnKeys: dto.dependsOnKeys ?? [],
        dueDate: dto.dueOffsetDays == null ? null : new Date(flow.startedAt.getTime() + dto.dueOffsetDays * 86_400_000),
        required: dto.required ?? true, sortOrder: dto.sortOrder ?? flow.tasks.length,
      } });
      await this.createOperationalEvent(tx, { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, actorUserId: actor.sub, title: 'Tarea de incorporación creada', description: dto.title, payload: { kind: 'TASK_CREATED', flowId, taskKey: dto.taskKey } });
    });
    await this.recomputeFlow(flowId, actor.sub);
    return this.getFlow(tenantId, flowId, actor);
  }

  async reorderTasks(tenantId: string, flowId: string, actor: JwtPayload, dto: ReorderOnboardingTasksDto) {
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId, ...this.branchScope(actor) }, include: { tasks: true } });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    const taskIds = new Set(flow.tasks.map((task) => task.id));
    if (dto.items.some((item) => !taskIds.has(item.id)) || new Set(dto.items.map((item) => item.id)).size !== dto.items.length) throw new BadRequestException('Task order contains invalid items');
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) await tx.onboardingTask.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
      await this.createOperationalEvent(tx, { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, actorUserId: actor.sub, title: 'Checklist reordenado', description: `${dto.items.length} tareas actualizadas.`, payload: { kind: 'TASKS_REORDERED', flowId } });
    });
    return this.getFlow(tenantId, flowId, actor);
  }

  async deleteTask(tenantId: string, taskId: string, actor: JwtPayload) {
    const task = await this.prisma.onboardingTask.findFirst({ where: { id: taskId, tenantId }, include: { onboardingFlow: { include: { tasks: true } }, documents: { where: { deletedAt: null } } } });
    if (!task) throw new NotFoundException('Onboarding task not found');
    this.assertActorCanAccessBranch(actor, task.branchId);
    if (task.status === WorkflowTaskStatus.COMPLETED) throw new ConflictException('Completed tasks must be cancelled before deletion');
    if (task.documents.length) throw new ConflictException('A task with documents cannot be deleted');
    await this.prisma.$transaction(async (tx) => {
      for (const dependent of task.onboardingFlow.tasks.filter((item) => this.stringArray(item.dependsOnKeys).includes(task.taskKey))) {
        await tx.onboardingTask.update({ where: { id: dependent.id }, data: { dependsOnKeys: this.stringArray(dependent.dependsOnKeys).filter((key) => key !== task.taskKey) } });
      }
      await tx.onboardingTask.delete({ where: { id: task.id } });
      await this.createOperationalEvent(tx, { tenantId, branchId: task.branchId, workflowId: task.workflowId, actorUserId: actor.sub, title: 'Tarea de incorporación eliminada', description: task.title, payload: { kind: 'TASK_DELETED', flowId: task.onboardingFlowId, taskKey: task.taskKey } });
    });
    await this.recomputeFlow(task.onboardingFlowId, actor.sub);
    return this.getFlow(tenantId, task.onboardingFlowId, actor);
  }

  async uploadDocument(tenantId: string, actor: JwtPayload, flowId: string, taskId: string | undefined, category: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A document is required');
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    this.assertActorCanAccessBranch(actor, flow.branchId);
    if (taskId) {
      const belongs = await this.prisma.onboardingTask.count({ where: { id: taskId, onboardingFlowId: flowId, tenantId } });
      if (!belongs) throw new BadRequestException('Task does not belong to onboarding flow');
    }
    const scan = await this.antivirus.scan(file.buffer);
    const stored = await this.storage.store(tenantId, flow.employeeId, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.employeeDocument.create({
          data: {
            tenantId, branchId: flow.branchId, employeeId: flow.employeeId, onboardingFlowId: flow.id, taskId,
            category: category || 'OTHER', originalName: file.originalname, storageKey: stored.key, mimeType: file.mimetype,
            sizeBytes: file.size, checksum: stored.checksum, scanStatus: scan.status,
            uploadedById: actor.sub,
          },
        });
        await this.createOperationalEvent(tx, {
          tenantId,
          branchId: flow.branchId,
          workflowId: flow.workflowId,
          actorUserId: actor.sub,
          title: 'Documento incorporado al expediente',
          description: file.originalname,
          payload: { kind: 'DOCUMENT_UPLOADED', flowId, taskId, documentId: document.id, category: category || 'OTHER' },
        });
        return { ...document, storageVisibility: 'PRIVATE', encryptedAtRest: true, scannedAt: new Date() };
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async downloadDocument(tenantId: string, id: string, actor: JwtPayload) {
    const document = await this.prisma.employeeDocument.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!document) throw new NotFoundException('Document not found');
    this.assertActorCanAccessBranch(actor, document.branchId);
    if (!['CLEAN', 'PASSED', 'SAFE'].includes(document.scanStatus.toUpperCase())) throw new ForbiddenException('Document scan has not been approved');
    return { document, buffer: await this.storage.read(document.storageKey) };
  }

  async reviewDocument(tenantId: string, actor: JwtPayload, id: string, dto: ReviewEmployeeDocumentDto) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { onboardingFlow: { select: { workflowId: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    this.assertActorCanAccessBranch(actor, document.branchId);
    if (dto.status === 'REJECTED' && !dto.reason?.trim()) throw new BadRequestException('A rejection reason is required');
    if (!['CLEAN', 'PASSED', 'SAFE'].includes(document.scanStatus.toUpperCase())) throw new ConflictException('Document cannot be reviewed before security scan approval');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employeeDocument.update({
        where: { id },
        data: { status: dto.status, rejectionReason: dto.status === 'REJECTED' ? dto.reason!.trim() : null, reviewedAt: new Date(), reviewedById: actor.sub },
      });
      if (document.onboardingFlow?.workflowId) {
        await this.createOperationalEvent(tx, {
          tenantId,
          branchId: document.branchId,
          workflowId: document.onboardingFlow.workflowId,
          actorUserId: actor.sub,
          title: dto.status === 'APPROVED' ? 'Documento aprobado' : 'Documento rechazado',
          description: dto.status === 'REJECTED' ? `${document.originalName}: ${dto.reason!.trim()}` : document.originalName,
          payload: { kind: 'DOCUMENT_REVIEWED', documentId: id, status: dto.status, reason: dto.reason?.trim() },
        });
      }
      return updated;
    });
  }

  async replaceDocument(tenantId: string, actor: JwtPayload, id: string, file: Express.Multer.File) {
    const previous = await this.prisma.employeeDocument.findFirst({ where: { id, tenantId, deletedAt: null }, include: { onboardingFlow: { select: { workflowId: true } } } });
    if (!previous) throw new NotFoundException('Document not found');
    this.assertActorCanAccessBranch(actor, previous.branchId);
    const scan = await this.antivirus.scan(file.buffer);
    const stored = await this.storage.store(tenantId, previous.employeeId, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replacement = await tx.employeeDocument.create({ data: {
          tenantId, branchId: previous.branchId, employeeId: previous.employeeId, onboardingFlowId: previous.onboardingFlowId,
          taskId: previous.taskId, category: previous.category, originalName: file.originalname, storageKey: stored.key,
          mimeType: file.mimetype, sizeBytes: file.size, checksum: stored.checksum, scanStatus: scan.status,
          uploadedById: actor.sub, expiresAt: previous.expiresAt, version: previous.version + 1, replacesDocumentId: previous.id,
        } });
        await tx.employeeDocument.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED' } });
        if (previous.onboardingFlow?.workflowId) await this.createOperationalEvent(tx, {
          tenantId, branchId: previous.branchId, workflowId: previous.onboardingFlow.workflowId, actorUserId: actor.sub,
          title: 'Documento renovado', description: `${previous.originalName} → ${file.originalname}`,
          payload: { kind: 'DOCUMENT_REPLACED', previousDocumentId: previous.id, documentId: replacement.id, version: replacement.version },
        });
        return { ...replacement, storageVisibility: 'PRIVATE', encryptedAtRest: true, scannedAt: new Date() };
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async updateDocumentLifecycle(tenantId: string, actor: JwtPayload, id: string, dto: UpdateEmployeeDocumentLifecycleDto) {
    const document = await this.prisma.employeeDocument.findFirst({ where: { id, tenantId, deletedAt: null }, include: { onboardingFlow: { select: { workflowId: true } } } });
    if (!document) throw new NotFoundException('Document not found');
    this.assertActorCanAccessBranch(actor, document.branchId);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employeeDocument.update({ where: { id }, data: { expiresAt } });
      if (document.onboardingFlow?.workflowId) await this.createOperationalEvent(tx, {
        tenantId, branchId: document.branchId, workflowId: document.onboardingFlow.workflowId, actorUserId: actor.sub,
        title: 'Vigencia documental actualizada', description: expiresAt ? `${document.originalName} vence el ${expiresAt.toISOString()}` : `${document.originalName} sin caducidad`,
        payload: { kind: 'DOCUMENT_LIFECYCLE_UPDATED', documentId: id, expiresAt: expiresAt?.toISOString() ?? null },
      });
      return updated;
    });
  }

  async deleteDocument(tenantId: string, actor: JwtPayload, id: string) {
    const document = await this.prisma.employeeDocument.findFirst({ where: { id, tenantId, deletedAt: null }, include: { onboardingFlow: { select: { workflowId: true } } } });
    if (!document) throw new NotFoundException('Document not found');
    this.assertActorCanAccessBranch(actor, document.branchId);
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.update({ where: { id }, data: { deletedAt: new Date(), status: 'DELETED' } });
      if (document.onboardingFlow?.workflowId) await this.createOperationalEvent(tx, {
        tenantId, branchId: document.branchId, workflowId: document.onboardingFlow.workflowId, actorUserId: actor.sub,
        title: 'Documento eliminado', description: document.originalName,
        payload: { kind: 'DOCUMENT_DELETED', documentId: id },
      });
    });
    await this.storage.delete(document.storageKey);
    return { deleted: true, id };
  }

  async completeFlow(tenantId: string, flowId: string, actor: JwtPayload) {
    const flow = await this.prisma.onboardingFlow.findFirst({
      where: { id: flowId, tenantId, ...this.branchScope(actor) },
      include: { tasks: true, documents: { where: { deletedAt: null, status: { not: 'SUPERSEDED' } } }, signaturePackages: true },
    });
    if (!flow) throw new NotFoundException('Onboarding flow not found');
    const incomplete = flow.tasks.filter((task) => task.required && task.status !== WorkflowTaskStatus.COMPLETED && task.status !== WorkflowTaskStatus.CANCELLED);
    const invalidDocuments = flow.documents.filter((document) => document.status !== 'APPROVED' || (document.expiresAt && document.expiresAt <= new Date()));
    const incompleteSignatures = flow.signaturePackages.filter((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED');
    const blockers = [
      ...incomplete.map((task) => `Tarea pendiente: ${task.title}`),
      ...invalidDocuments.map((document) => `Documento sin aprobar o vencido: ${document.originalName}`),
      ...incompleteSignatures.map((item) => `Firma pendiente: ${item.title}`),
    ];
    if (blockers.length) throw new ConflictException({ message: 'Onboarding flow is not ready to close', blockers });
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingFlow.update({ where: { id: flow.id }, data: { status: WorkflowTaskStatus.COMPLETED, readinessStatus: 'READY', completedAt: new Date() } });
      await this.createOperationalEvent(tx, { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, actorUserId: actor.sub, title: 'Expediente de incorporación cerrado', description: 'Checklist, documentos y firmas fueron validados.', payload: { kind: 'ONBOARDING_CLOSED', flowId } });
    });
    return this.getFlow(tenantId, flowId, actor);
  }

  private async decorateFlows<T extends {
    tasks: Array<{
      taskKey: string;
      title: string;
      status: WorkflowTaskStatus;
      dueDate: Date | null;
      ownerId: string | null;
      blockingReason: string | null;
      dependsOnKeys: Prisma.JsonValue | null;
    }>;
    documents?: Array<{ scanStatus: string; [key: string]: unknown }>;
    workflow?: { operationalEvents?: Array<{ id: string; eventType: OperationalEventType; title: string | null; description: string | null; payload: Prisma.JsonValue | null; occurredAt: Date; actorUser?: { id: string; firstName: string; lastName: string; email: string } | null }> } | null;
  }>(tenantId: string, flows: T[]) {
    const ownerIds = [...new Set(flows.flatMap((flow) => flow.tasks.map((task) => task.ownerId).filter((id): id is string => Boolean(id))))];
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const ownerDirectory = new Map(owners.map((owner) => [owner.id, {
      id: owner.id,
      name: `${owner.firstName} ${owner.lastName}`.trim(),
      email: owner.email,
    }]));
    return flows.map((flow) => this.decorateFlow(flow, ownerDirectory));
  }

  private decorateFlow<T extends {
    tasks: Array<{
      taskKey: string;
      title: string;
      status: WorkflowTaskStatus;
      dueDate: Date | null;
      ownerId: string | null;
      blockingReason: string | null;
      dependsOnKeys: Prisma.JsonValue | null;
    }>;
    documents?: Array<{ scanStatus: string; [key: string]: unknown }>;
    workflow?: { operationalEvents?: Array<{ id: string; eventType: OperationalEventType; title: string | null; description: string | null; payload: Prisma.JsonValue | null; occurredAt: Date; actorUser?: { id: string; firstName: string; lastName: string; email: string } | null }> } | null;
  }>(flow: T, ownerDirectory: Map<string, { id: string; name: string; email: string }>) {
    const now = Date.now();
    const completed = new Set(flow.tasks.filter((task) => task.status === WorkflowTaskStatus.COMPLETED).map((task) => task.taskKey));
    const tasks = flow.tasks.map((task) => {
      const dependencies = this.stringArray(task.dependsOnKeys);
      const waitingFor = dependencies.filter((key) => !completed.has(key));
      const waitingForLabels = flow.tasks.filter((candidate) => waitingFor.includes(candidate.taskKey)).map((candidate) => candidate.title);
      return {
        ...task,
        owner: task.ownerId ? ownerDirectory.get(task.ownerId) ?? null : null,
        waitingFor,
        waitingForLabels,
        blocked: Boolean(task.blockingReason || waitingFor.length),
        overdue: Boolean(task.dueDate && task.dueDate.getTime() < now && task.status !== WorkflowTaskStatus.COMPLETED),
      };
    });
    const nextAction = tasks.find((task) => task.status !== WorkflowTaskStatus.COMPLETED && !task.blocked) ?? null;
    return {
      ...flow, tasks, nextAction,
      documents: flow.documents?.map((document) => ({ ...document, storageVisibility: 'PRIVATE', encryptedAtRest: true, scannedAt: ['CLEAN', 'PASSED', 'SAFE'].includes(document.scanStatus.toUpperCase()) ? new Date() : null })),
      timeline: (flow.workflow?.operationalEvents ?? []).map((event) => ({
        id: event.id,
        type: event.eventType,
        title: event.title ?? 'Actividad de incorporación',
        description: event.description,
        occurredAt: event.occurredAt,
        actor: event.actorUser ? { id: event.actorUser.id, name: `${event.actorUser.firstName} ${event.actorUser.lastName}`.trim(), email: event.actorUser.email, type: 'USER' } : { type: 'SYSTEM', name: 'Sistema / automatización' },
        payload: event.payload,
      })),
      alerts: tasks.filter((task) => task.overdue || task.blockingReason).map((task) => ({ taskId: task.taskKey, severity: task.overdue ? 'danger' : 'warning', message: task.overdue ? `${task.title} está vencida` : task.blockingReason })),
      progressPercent: tasks.length ? Math.round((tasks.filter((task) => task.status === WorkflowTaskStatus.COMPLETED).length / tasks.length) * 100) : 0,
    };
  }

  private async recomputeFlow(flowId: string, actorUserId?: string) {
    const tasks = await this.prisma.onboardingTask.findMany({ where: { onboardingFlowId: flowId } });
    const requiredTasks = tasks.filter((task) => task.required);
    const allDone = requiredTasks.length > 0 && requiredTasks.every((task) => task.status === WorkflowTaskStatus.COMPLETED || task.status === WorkflowTaskStatus.CANCELLED);
    await this.prisma.$transaction(async (tx) => {
      const flow = await tx.onboardingFlow.update({
        where: { id: flowId },
        data: { status: WorkflowTaskStatus.IN_PROGRESS, completedAt: null, readinessStatus: allDone ? 'READY_FOR_REVIEW' : 'IN_PROGRESS' },
      });
      if (allDone) {
        const alreadyRecorded = await tx.operationalEvent.count({
          where: { workflowId: flow.workflowId, title: 'Checklist listo para cierre' },
        });
        if (!alreadyRecorded) {
          await tx.operationalEvent.create({
            data: {
              tenantId: flow.tenantId,
              branchId: flow.branchId,
              workflowId: flow.workflowId,
              actorUserId,
              eventType: OperationalEventType.WORKFLOW_NOTE_ADDED,
              title: 'Checklist listo para cierre',
              description: 'Todas las tareas obligatorias fueron atendidas; falta confirmar documentos y firmas.',
              payload: { flowId },
            },
          });
        }
      }
    });
  }

  private validateDependencies(tasks: CreateOnboardingTemplateDto['tasks']) {
    const keys = new Set(tasks.map((task) => task.taskKey));
    if (keys.size !== tasks.length) throw new BadRequestException('Task keys must be unique');
    for (const task of tasks) {
      if ((task.dependsOnKeys ?? []).includes(task.taskKey)) throw new BadRequestException(`Task ${task.taskKey} cannot depend on itself`);
      for (const dependency of task.dependsOnKeys ?? []) if (!keys.has(dependency)) throw new BadRequestException(`Unknown dependency ${dependency}`);
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const dependencies = new Map(tasks.map((task) => [task.taskKey, task.dependsOnKeys ?? []]));
    const visit = (key: string) => {
      if (visiting.has(key)) throw new BadRequestException(`Circular dependency detected at ${key}`);
      if (visited.has(key)) return;
      visiting.add(key);
      for (const dependency of dependencies.get(key) ?? []) visit(dependency);
      visiting.delete(key);
      visited.add(key);
    };
    for (const key of keys) visit(key);
  }

  private validateRuntimeDependencies(taskKey: string, dependencies: string[], tasks: Array<{ taskKey: string; dependsOnKeys: Prisma.JsonValue | null }>) {
    if (dependencies.includes(taskKey)) throw new BadRequestException(`Task ${taskKey} cannot depend on itself`);
    const knownKeys = new Set(tasks.map((task) => task.taskKey));
    for (const dependency of dependencies) if (!knownKeys.has(dependency)) throw new BadRequestException(`Unknown dependency ${dependency}`);
    const graph = new Map(tasks.map((task) => [task.taskKey, task.taskKey === taskKey ? dependencies : this.stringArray(task.dependsOnKeys)]));
    graph.set(taskKey, dependencies);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string) => {
      if (visiting.has(key)) throw new BadRequestException(`Circular dependency detected at ${key}`);
      if (visited.has(key)) return;
      visiting.add(key);
      for (const dependency of graph.get(key) ?? []) visit(dependency);
      visiting.delete(key);
      visited.add(key);
    };
    for (const key of graph.keys()) visit(key);
  }

  private async validateOwners(
    tenantId: string,
    tasks: Array<{ ownerType?: WorkflowOwnerType | null; ownerId?: string | null }>,
    branchId?: string,
  ) {
    for (const task of tasks) {
      await this.validateOwner(tenantId, task.ownerType ?? WorkflowOwnerType.SYSTEM, task.ownerId, branchId);
    }
  }

  private async validateOwner(tenantId: string, ownerType: WorkflowOwnerType, ownerId?: string | null, branchId?: string) {
    if (ownerType === WorkflowOwnerType.USER && !ownerId) {
      throw new BadRequestException('A user owner requires ownerId');
    }
    if (ownerType !== WorkflowOwnerType.USER && ownerId) {
      throw new BadRequestException('ownerId is only accepted for user-owned tasks');
    }
    if (!ownerId) return;
    const count = await this.prisma.user.count({
      where: {
        id: ownerId,
        tenantId,
        status: UserStatus.ACTIVE,
        ...(branchId
          ? {
              OR: [
                { activeBranchId: branchId },
                { branchAccesses: { some: { branchId } } },
              ],
            }
          : {}),
      },
    });
    if (!count) throw new BadRequestException('Task owner is not active in the selected branch');
  }

  private branchScope(actor: JwtPayload): Prisma.OnboardingFlowWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) return {};
    return { branchId: { in: actor.allowedBranchIds } };
  }

  private assertActorCanAccessBranch(actor: JwtPayload, branchId: string) {
    if (!actor.isSuperAdmin && actor.scope === AccessScope.BRANCH && !actor.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Onboarding flow does not belong to an allowed branch');
    }
  }

  private createOperationalEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      workflowId: string;
      actorUserId?: string | null;
      title: string;
      description: string;
      payload: Record<string, unknown>;
    },
  ) {
    return tx.operationalEvent.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        workflowId: input.workflowId,
        actorUserId: input.actorUserId,
        eventType: OperationalEventType.WORKFLOW_NOTE_ADDED,
        title: input.title,
        description: input.description,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  private stringArray(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}
