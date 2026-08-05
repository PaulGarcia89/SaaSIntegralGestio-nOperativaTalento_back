import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SignaturePackageStatus, SignatureParticipantStatus, WorkflowTaskStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSignaturePackageDto, CreateSignatureTemplateDto, SubmitSignatureConsentDto } from './dto/signatures.dto';
import { SignatureProviderService } from './signature-provider.service';
import { JobOffersService } from '../job-offers/job-offers.service';
import { publicFrontendUrl } from '../common/urls/public-frontend-url';

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService, private readonly providers: SignatureProviderService, private readonly offers: JobOffersService) {}

  providersOverview() { return this.providers.describe(); }

  listTemplates(tenantId: string) {
    return this.prisma.signatureTemplate.findMany({ where: { tenantId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  }

  async createTemplate(tenantId: string, actorId: string, dto: CreateSignatureTemplateDto) {
    this.providers.assertAvailable(dto.provider ?? 'INTERNAL');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.signatureTemplate.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
      const latest = await tx.signatureTemplate.findFirst({ where: { tenantId, name: dto.name }, orderBy: { version: 'desc' } });
      return tx.signatureTemplate.create({ data: {
        tenantId, name: dto.name.trim(), description: dto.description?.trim(), version: (latest?.version ?? 0) + 1,
        provider: dto.provider ?? 'INTERNAL', title: dto.title.trim(), content: dto.content,
        consentText: dto.consentText.trim(), isDefault: dto.isDefault ?? false, createdById: actorId,
      } });
    });
  }

  async listPackages(tenantId: string) {
    return this.prisma.signaturePackage.findMany({
      where: { tenantId },
      include: {
        employee: { select: { id: true, name: true, email: true } },
        onboardingFlow: { select: { id: true, readinessStatus: true } },
        template: { select: { id: true, name: true, version: true, provider: true } },
        participants: { orderBy: { createdAt: 'asc' } },
        auditEvents: { orderBy: { occurredAt: 'desc' }, take: 20 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createPackage(tenantId: string, actorId: string, requestId: string | undefined, dto: CreateSignaturePackageDto) {
    if (!dto.participants.length) throw new BadRequestException('At least one signer is required');
    const [flow, template] = await Promise.all([
      this.prisma.onboardingFlow.findFirst({ where: { id: dto.onboardingFlowId, tenantId }, include: { employee: true } }),
      this.prisma.signatureTemplate.findFirst({ where: { id: dto.templateId, tenantId, isActive: true } }),
    ]);
    if (!flow || !template) throw new NotFoundException('Onboarding flow or signature template not found');
    this.providers.assertAvailable(template.provider);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.signaturePackage.create({
        data: {
          tenantId, branchId: flow.branchId, workflowId: flow.workflowId, employeeId: flow.employeeId,
          onboardingFlowId: flow.id, templateId: template.id, title: dto.title?.trim() || template.title,
          externalProvider: template.provider, status: SignaturePackageStatus.DRAFT,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          metadata: { templateVersion: template.version, documentChecksum: this.hash(template.content), consentChecksum: this.hash(template.consentText) },
          participants: { create: dto.participants.map((participant) => ({ tenantId, email: participant.email.toLowerCase(), fullName: participant.fullName.trim(), roleLabel: participant.roleLabel?.trim(), consentVersion: `${template.id}:v${template.version}` })) },
          auditEvents: { create: { tenantId, actorId, action: 'PACKAGE_CREATED', outcome: 'SUCCESS', requestId, evidence: { templateId: template.id, templateVersion: template.version } } },
        },
        include: { participants: true, template: true, employee: true },
      });
      await tx.onboardingTask.upsert({
        where: { onboardingFlowId_taskKey: { onboardingFlowId: flow.id, taskKey: 'electronic-signature' } },
        update: { status: WorkflowTaskStatus.PENDING, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        create: { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, onboardingFlowId: flow.id, employeeId: flow.employeeId, taskKey: 'electronic-signature', taskType: 'POLICY_REVIEW', title: 'Firmar documentos de incorporación', description: 'Completar consentimientos y firmas pendientes.', dueDate: dto.dueDate ? new Date(dto.dueDate) : null, ownerType: 'USER' },
      });
      return item;
    });
  }

  async sendPackage(tenantId: string, actorId: string, packageId: string, requestId?: string) {
    const item = await this.prisma.signaturePackage.findFirst({ where: { id: packageId, tenantId }, include: { participants: true, template: true } });
    if (!item || !item.template) throw new NotFoundException('Signature package not found');
    if (item.status === SignaturePackageStatus.COMPLETED || item.status === SignaturePackageStatus.CANCELLED) throw new ConflictException('Package cannot be sent');
    this.providers.assertAvailable(item.template.provider);
    const origin = publicFrontendUrl();
    const links: Array<{ participantId: string; email: string; url: string }> = [];
    await this.prisma.$transaction(async (tx) => {
      for (const participant of item.participants.filter((entry) => entry.status === SignatureParticipantStatus.PENDING)) {
        const token = randomBytes(32).toString('base64url');
        await tx.signatureParticipant.update({ where: { id: participant.id }, data: { signingTokenHash: this.hash(token), tokenExpiresAt: new Date(Date.now() + 7 * 86_400_000) } });
        links.push({ participantId: participant.id, email: participant.email, url: `${origin}/sign/${token}` });
      }
      await tx.signaturePackage.update({ where: { id: item.id }, data: { status: SignaturePackageStatus.PENDING, sentAt: new Date() } });
      await tx.signatureAuditEvent.create({ data: { tenantId, packageId: item.id, actorId, action: 'PACKAGE_SENT', outcome: 'SUCCESS', requestId, evidence: { recipients: links.map((link) => link.email), provider: item.template!.provider } } });
    });
    return { packageId: item.id, provider: item.template.provider, signingLinks: links };
  }

  async remind(tenantId: string, actorId: string, packageId: string, requestId?: string) {
    const sent = await this.sendPackage(tenantId, actorId, packageId, requestId);
    await this.prisma.$transaction([
      this.prisma.signaturePackage.update({ where: { id: packageId }, data: { lastReminderAt: new Date() } }),
      this.prisma.signatureParticipant.updateMany({ where: { packageId, status: SignatureParticipantStatus.PENDING }, data: { lastReminderAt: new Date() } }),
      this.prisma.signatureAuditEvent.create({ data: { tenantId, packageId, actorId, action: 'REMINDER_SENT', outcome: 'SUCCESS', requestId, evidence: { recipients: sent.signingLinks.map((link) => link.email) } } }),
    ]);
    return sent;
  }

  async getSigningContext(token: string) {
    const participant = await this.prisma.signatureParticipant.findFirst({
      where: { signingTokenHash: this.hash(token) },
      include: { signaturePackage: { include: { template: true, employee: { select: { name: true } } } } },
    });
    if (!participant || !participant.signaturePackage.template) throw new NotFoundException('Signing request not found');
    if (!participant.tokenExpiresAt || participant.tokenExpiresAt.getTime() < Date.now()) throw new ConflictException('Signing request expired');
    if (participant.status === SignatureParticipantStatus.SIGNED) throw new ConflictException('Document already signed');
    const template = participant.signaturePackage.template;
    return { participant: { fullName: participant.fullName, email: participant.email, roleLabel: participant.roleLabel }, package: { title: participant.signaturePackage.title, dueDate: participant.signaturePackage.dueDate, employeeName: participant.signaturePackage.employee?.name }, document: { title: template.title, content: template.content, consentText: template.consentText, version: template.version } };
  }

  async sign(token: string, dto: SubmitSignatureConsentDto, network: { ip?: string; userAgent?: string; requestId?: string }) {
    if (!dto.accepted) throw new BadRequestException('Consent is required');
    const tokenHash = this.hash(token);
    const participant = await this.prisma.signatureParticipant.findFirst({ where: { signingTokenHash: tokenHash }, include: { signaturePackage: { include: { template: true, participants: true } } } });
    if (!participant || !participant.signaturePackage.template) throw new NotFoundException('Signing request not found');
    if (participant.fullName.trim().toLocaleLowerCase() !== dto.typedName.trim().toLocaleLowerCase()) throw new BadRequestException('Typed name does not match signer');
    if (!participant.tokenExpiresAt || participant.tokenExpiresAt.getTime() < Date.now()) throw new ConflictException('Signing request expired');
    if (participant.status === SignatureParticipantStatus.SIGNED) throw new ConflictException('Document already signed');
    const now = new Date();
    const ipHash = this.hash(network.ip ?? 'unknown');
    const userAgentHash = this.hash(network.userAgent ?? 'unknown');
    const template = participant.signaturePackage.template;
    const evidence: Prisma.InputJsonObject = { typedName: dto.typedName.trim(), accepted: true, signedAt: now.toISOString(), documentChecksum: this.hash(template.content), consentChecksum: this.hash(template.consentText), tokenFingerprint: tokenHash.slice(0, 16) };
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureParticipant.update({ where: { id: participant.id }, data: { status: SignatureParticipantStatus.SIGNED, signedAt: now, consentedAt: now, signingTokenHash: null, tokenExpiresAt: null, ipHash, userAgentHash, evidence } });
      await tx.signatureAuditEvent.create({ data: { tenantId: participant.tenantId, packageId: participant.packageId, participantId: participant.id, action: 'CONSENT_SIGNED', outcome: 'SUCCESS', requestId: network.requestId, ipHash, userAgentHash, evidence } });
      const remaining = await tx.signatureParticipant.count({ where: { packageId: participant.packageId, id: { not: participant.id }, status: { not: SignatureParticipantStatus.SIGNED } } });
      if (remaining === 0) {
        await tx.signaturePackage.update({ where: { id: participant.packageId }, data: { status: SignaturePackageStatus.COMPLETED, signedAt: now } });
        if (participant.signaturePackage.onboardingFlowId) {
          const flowId = participant.signaturePackage.onboardingFlowId;
          await tx.onboardingTask.updateMany({ where: { onboardingFlowId: flowId, taskKey: 'electronic-signature' }, data: { status: WorkflowTaskStatus.COMPLETED, progressPercent: 100, completedAt: now } });
          const incompleteTasks = await tx.onboardingTask.count({ where: { onboardingFlowId: flowId, status: { not: WorkflowTaskStatus.COMPLETED } } });
          await tx.onboardingFlow.update({
            where: { id: flowId },
            data: {
              status: WorkflowTaskStatus.IN_PROGRESS,
              readinessStatus: incompleteTasks === 0 ? 'READY_FOR_REVIEW' : 'IN_PROGRESS',
              completedAt: null,
            },
          });
        }
        await tx.signatureAuditEvent.create({ data: { tenantId: participant.tenantId, packageId: participant.packageId, action: 'PACKAGE_COMPLETED', outcome: 'SUCCESS', evidence: { completedAt: now.toISOString() } } });
      } else {
        await tx.signaturePackage.update({ where: { id: participant.packageId }, data: { status: SignaturePackageStatus.PARTIALLY_SIGNED } });
      }
    });
    if (participant.signaturePackage.offerVersionId) {
      await this.offers.completeSignedOffer(participant.signaturePackage.offerVersionId);
    }
    return { signed: true, packageId: participant.packageId, signedAt: now.toISOString() };
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
