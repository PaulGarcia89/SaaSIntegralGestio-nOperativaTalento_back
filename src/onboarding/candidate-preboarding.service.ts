import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationalEventType, WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';

@Injectable()
export class CandidatePreboardingService {
  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService, private readonly antivirus: TrainingAntivirusService) {}

  async overview(accountId: string) {
    const flow = await this.findFlow(accountId);
    if (!flow) return null;
    return { id: flow.id, employee: flow.employee, status: flow.status, readinessStatus: flow.readinessStatus, startedAt: flow.startedAt, tasks: flow.tasks, documents: flow.documents, signatures: flow.signaturePackages, progressPercent: flow.tasks.length ? Math.round(flow.tasks.filter((task) => task.status === 'COMPLETED').length * 100 / flow.tasks.length) : 0 };
  }

  async completeTask(accountId: string, taskId: string) {
    const flow = await this.flow(accountId);
    const task = flow.tasks.find((item) => item.id === taskId);
    if (!task) throw new NotFoundException('Task not found');
    if (!['EMPLOYEE', 'CANDIDATE'].includes(task.ownerType)) throw new BadRequestException('This task must be completed by its assigned team');
    await this.prisma.$transaction(async (tx) => {
      await tx.onboardingTask.update({ where: { id: task.id }, data: { status: WorkflowTaskStatus.COMPLETED, progressPercent: 100, completedAt: new Date(), blockingReason: null } });
      await tx.operationalEvent.create({ data: { tenantId: flow.tenantId, branchId: flow.branchId, workflowId: flow.workflowId, eventType: OperationalEventType.WORKFLOW_NOTE_ADDED, title: 'Tarea completada desde preboarding', description: task.title, payload: { taskId: task.id, candidateAccountId: accountId } } });
    });
    return this.overview(accountId);
  }

  async uploadDocument(accountId: string, taskId: string | undefined, category: string, file: Express.Multer.File) {
    const flow = await this.flow(accountId);
    if (!file || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype) || file.size > 15 * 1024 * 1024) throw new BadRequestException('Only PDF, JPEG or PNG documents up to 15 MB are accepted');
    if (taskId && !flow.tasks.some((task) => task.id === taskId && ['EMPLOYEE', 'CANDIDATE'].includes(task.ownerType))) throw new BadRequestException('Document task is not available in your portal');
    const scan = await this.antivirus.scan(file.buffer);
    const stored = await this.storage.store(flow.tenantId, flow.employeeId, file);
    try {
      const document = await this.prisma.employeeDocument.create({ data: { tenantId: flow.tenantId, branchId: flow.branchId, employeeId: flow.employeeId, onboardingFlowId: flow.id, taskId, category: category || 'OTHER', originalName: file.originalname, storageKey: stored.key, mimeType: file.mimetype, sizeBytes: file.size, checksum: stored.checksum, scanStatus: scan.status, uploadedByCandidateAccountId: accountId } });
      await this.prisma.operationalEvent.create({ data: { tenantId: flow.tenantId, branchId: flow.branchId, workflowId: flow.workflowId, eventType: OperationalEventType.WORKFLOW_NOTE_ADDED, title: 'Documento cargado desde preboarding', description: file.originalname, payload: { documentId: document.id, taskId, candidateAccountId: accountId } } });
      return { ...document, storageVisibility: 'PRIVATE', scannedAt: new Date() };
    } catch (error) { await this.storage.delete(stored.key).catch(() => undefined); throw error; }
  }

  private async flow(accountId: string) {
    const flow = await this.findFlow(accountId);
    if (!flow) throw new NotFoundException('No active preboarding was found for this account');
    return flow;
  }

  private async findFlow(accountId: string) {
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { candidate: { accountId }, status: { not: WorkflowTaskStatus.COMPLETED } }, include: { employee: { select: { name: true, jobTitle: true, email: true } }, tasks: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, description: true, status: true, ownerType: true, dueDate: true, required: true } }, documents: { where: { deletedAt: null, status: { not: 'SUPERSEDED' } }, select: { id: true, originalName: true, status: true, createdAt: true, category: true } }, signaturePackages: { select: { id: true, title: true, status: true, dueDate: true } } }, orderBy: { startedAt: 'desc' } });
    return flow;
  }
}
