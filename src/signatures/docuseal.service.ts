import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingDocumentStorageService } from '../onboarding/onboarding-document-storage.service';

type DocuSealTemplate = { key: string; label: string; id: number; url?: string };
type DocuSealSubmission = { id: number; slug?: string; submission_id?: number; completed_at?: string | null; status?: string; documents?: Array<{ name?: string; url: string }> };

@Injectable()
export class DocuSealService {
  private readonly baseUrl = (process.env.DOCUSEAL_BASE_URL ?? 'https://api.docuseal.com').replace(/\/$/, '');
  private readonly apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  private readonly webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();

  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService) {}

  templates(): DocuSealTemplate[] {
    const templates: DocuSealTemplate[] = [];
    const definitions = [
      ['employment-agreement', 'Employment Agreement', 'DOCUSEAL_TEMPLATE_EMPLOYMENT_AGREEMENT_ID', 'DOCUSEAL_TEMPLATE_EMPLOYMENT_AGREEMENT_URL'],
      ['nda', 'NDA / Confidentiality Agreement', 'DOCUSEAL_TEMPLATE_NDA_ID', 'DOCUSEAL_TEMPLATE_NDA_URL'],
    ] as const;
    for (const [key, label, idName, urlName] of definitions) {
      const rawId = process.env[idName]?.trim();
      if (rawId && /^\d+$/.test(rawId)) templates.push({ key, label, id: Number(rawId), url: process.env[urlName]?.trim() || undefined });
    }
    return templates;
  }

  isConfigured() { return Boolean(this.apiKey && this.templates().length); }

  async createEmployeeSubmission(tenantId: string, actorId: string, employeeId: string, templateKey: string) {
    this.assertConfigured();
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId }, include: { branchAssignments: { where: { isPrimary: true, releasedAt: null }, take: 1 } } });
    if (!employee || !employee.branchAssignments[0]) throw new NotFoundException('Empleado no encontrado');
    const template = this.templates().find((item) => item.key === templateKey);
    if (!template) throw new BadRequestException('Plantilla DocuSeal no configurada');

    const response = await this.request<DocuSealSubmission[]>('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        template_id: template.id,
        send_email: true,
        submitters: [{ name: employee.name, email: employee.workEmail ?? employee.email, role: 'First Party', external_id: employee.id, metadata: { employeeId: employee.id, tenantId, templateKey } }],
      }),
    });
    const submitter = response[0];
    const externalPackageId = String(submitter?.submission_id ?? submitter?.id ?? '');
    if (!externalPackageId) throw new ServiceUnavailableException('DocuSeal no devolvió el identificador de la solicitud');

    const pkg = await this.prisma.signaturePackage.create({
      data: {
        tenantId, branchId: employee.branchAssignments[0].branchId, employeeId: employee.id, title: template.label,
        externalProvider: 'DOCUSEAL', externalPackageId, status: 'PENDING', sentAt: new Date(),
        metadata: { templateKey, templateId: template.id, signingUrl: submitter?.slug ? `${this.baseUrl}/s/${submitter.slug}` : null, actorId },
        participants: { create: { tenantId, email: employee.workEmail ?? employee.email, fullName: employee.name, roleLabel: 'First Party', metadata: { docusealSubmitterId: submitter?.id ?? null } } },
        auditEvents: { create: { tenantId, actorId, action: 'DOCUSEAL_SUBMISSION_CREATED', outcome: 'SUCCESS', evidence: { templateKey, templateId: template.id, externalPackageId } } },
      },
      include: { participants: true },
    });
    return { packageId: pkg.id, externalPackageId, templateKey, label: template.label, signingUrl: submitter?.slug ? `${this.baseUrl}/s/${submitter.slug}` : template.url ?? null };
  }

  async handleWebhook(payload: { event_type?: string; data?: DocuSealSubmission & { submission_id?: number; email?: string; external_id?: string } }) {
    const event = payload.event_type ?? '';
    const data = (payload.data ?? {}) as DocuSealSubmission & { submission_id?: number; email?: string; external_id?: string };
    const externalPackageId = String(data.submission_id ?? data.id ?? '');
    if (!externalPackageId) return { ignored: true };
    const pkg = await this.prisma.signaturePackage.findFirst({ where: { externalProvider: 'DOCUSEAL', externalPackageId }, include: { employee: true } });
    if (!pkg) return { ignored: true };
    if (event === 'submission.completed' || event === 'form.completed') await this.completePackage(pkg.id);
    if (event === 'submission.expired') await this.prisma.signaturePackage.update({ where: { id: pkg.id }, data: { status: 'CANCELLED' } });
    return { received: true, packageId: pkg.id };
  }

  assertWebhookSecret(value?: string) {
    if (!this.webhookSecret || value !== this.webhookSecret) throw new BadRequestException('Webhook DocuSeal no autorizado');
  }

  private async completePackage(packageId: string) {
    const pkg = await this.prisma.signaturePackage.findUnique({ where: { id: packageId }, include: { employee: true, participants: true } });
    const employee = pkg?.employee;
    if (!pkg || !employee || pkg.status === 'COMPLETED') return;
    const response = await this.request<{ documents?: Array<{ name?: string; url: string }> }>(`/submissions/${encodeURIComponent(pkg.externalPackageId!)}/documents?merge=true`);
    const document = response.documents?.[0];
    if (!document?.url) throw new ServiceUnavailableException('DocuSeal no devolvió el PDF firmado');
    const fileResponse = await fetch(document.url);
    if (!fileResponse.ok) throw new ServiceUnavailableException('No fue posible descargar el PDF firmado de DocuSeal');
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const stored = await this.storage.store(pkg.tenantId, employee.id, { originalname: `${pkg.title}.pdf`, mimetype: 'application/pdf', size: buffer.length, buffer } as Express.Multer.File);
    await this.prisma.$transaction(async (tx) => {
      const employeeDocument = await tx.employeeDocument.create({ data: {
        tenantId: pkg.tenantId, branchId: pkg.branchId, employeeId: employee.id, category: 'EMPLOYMENT_AGREEMENT', originalName: `${pkg.title}.pdf`, storageKey: stored.key, mimeType: 'application/pdf', sizeBytes: buffer.length, checksum: stored.checksum, scanStatus: 'CLEAN', status: 'APPROVED', metadata: { source: 'docuseal', externalPackageId: pkg.externalPackageId, documentMeaning: 'EMPLOYMENT_AGREEMENT' },
      } });
      await tx.employeeComplianceRequirement.updateMany({ where: { tenantId: pkg.tenantId, employeeId: employee.id, code: 'EMPLOYMENT_AGREEMENT' }, data: { status: 'COMPLETE', completedAt: new Date(), documentId: employeeDocument.id, source: 'MANUAL' } });
      await tx.signaturePackage.update({ where: { id: pkg.id }, data: { status: 'COMPLETED', signedAt: new Date() } });
      await tx.signatureParticipant.updateMany({ where: { packageId: pkg.id }, data: { status: 'SIGNED', signedAt: new Date(), consentedAt: new Date() } });
      await tx.signatureAuditEvent.create({ data: { tenantId: pkg.tenantId, packageId: pkg.id, action: 'DOCUSEAL_SUBMISSION_COMPLETED', outcome: 'SUCCESS', evidence: { documentId: employeeDocument.id, checksum: createHash('sha256').update(buffer).digest('hex') } } });
    });
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Auth-Token': this.apiKey!, ...(init.headers ?? {}) } });
    if (!response.ok) throw new ServiceUnavailableException(`DocuSeal respondió con ${response.status}`);
    return response.json() as Promise<T>;
  }

  private assertConfigured() {
    if (!this.isConfigured()) throw new ServiceUnavailableException('DocuSeal no está configurado. Define DOCUSEAL_API_KEY y al menos una plantilla.');
  }
}
