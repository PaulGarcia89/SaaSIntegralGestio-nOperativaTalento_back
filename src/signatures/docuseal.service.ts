import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingDocumentStorageService } from '../onboarding/onboarding-document-storage.service';
import { EmailSettingsService } from '../email/email-settings.service';

type DocuSealTemplate = { key: string; label: string; id: number; url?: string };
type DocuSealSubmission = { id: number; slug?: string; submission_id?: number; submission_url?: string; url?: string; completed_at?: string | null; status?: string; documents?: Array<{ name?: string; url: string }> };

const hiringTemplateKeys = ['w9', 'i9', 'food-employee-reporting'] as const;

@Injectable()
export class DocuSealService {
  private readonly baseUrl = (process.env.DOCUSEAL_BASE_URL ?? 'https://api.docuseal.com').replace(/\/$/, '');
  private readonly apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  private readonly webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();

  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService, private readonly email: EmailSettingsService) {}

  templates(): DocuSealTemplate[] {
    const templates: DocuSealTemplate[] = [];
    const definitions = [
      ['w9', 'W-9', 'DOCUSEAL_TEMPLATE_W9_ID', 'DOCUSEAL_TEMPLATE_W9_URL'],
      ['i9', 'I-9', 'DOCUSEAL_TEMPLATE_I9_ID', 'DOCUSEAL_TEMPLATE_I9_URL'],
      ['food-employee-reporting', 'Food Employee Reporting', 'DOCUSEAL_TEMPLATE_FOOD_EMPLOYEE_REPORTING_ID', 'DOCUSEAL_TEMPLATE_FOOD_EMPLOYEE_REPORTING_URL'],
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

  async createHiringBundle(tenantId: string, actorId: string, employeeId: string) {
    const configured = new Set(this.templates().map((template) => template.key));
    const missing = hiringTemplateKeys.filter((key) => !configured.has(key));
    if (missing.length) {
      throw new BadRequestException(`Faltan plantillas DocuSeal de contratación: ${missing.join(', ')}`);
    }

    const existing = await this.prisma.signaturePackage.findMany({
      where: { tenantId, employeeId, externalProvider: 'DOCUSEAL' },
      select: { id: true, externalPackageId: true, title: true, status: true, metadata: true },
    });
    const existingKeys = new Set(existing.flatMap((item) => {
      const value = item.metadata;
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.templateKey === 'string' ? [value.templateKey] : [];
    }));
    const results = [];
    for (const templateKey of hiringTemplateKeys) {
      if (existingKeys.has(templateKey)) continue;
      results.push(await this.createEmployeeSubmission(tenantId, actorId, employeeId, templateKey, false));
    }
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { name: true, email: true, workEmail: true } });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    const links = results.map((item) => ({ label: item.label, url: item.signingUrl })).filter((item): item is { label: string; url: string } => Boolean(item.url));
    if (links.length) await this.email.sendCustom(tenantId, { recipient: employee.workEmail ?? employee.email, subject: 'Documentos necesarios para completar tu contratación', text: `Hola ${employee.name}, completa tus documentos de contratación: ${links.map((link) => `${link.label}: ${link.url}`).join(' | ')}`, html: this.hiringEmailHtml(employee.name, links) });
    return { employeeId, requiredTemplates: hiringTemplateKeys, created: results, alreadyCreated: existing.filter((item) => item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) && typeof item.metadata.templateKey === 'string').map((item) => ({ id: item.id, templateKey: (item.metadata as { templateKey: string }).templateKey, status: item.status })), emailSent: links.length > 0 };
  }

  async createHiringBundleForApplication(tenantId: string, actorId: string, applicationId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { candidateId: true },
    });
    if (!application) throw new NotFoundException('Postulación no encontrada');
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, sourceCandidateId: application.candidateId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('No existe un empleado asociado a esta postulación');
    return this.createHiringBundle(tenantId, actorId, employee.id);
  }

  async hiringBundleStatusForApplication(tenantId: string, applicationId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { candidateId: true },
    });
    if (!application) throw new NotFoundException('Postulación no encontrada');

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, sourceCandidateId: application.candidateId },
      select: { id: true },
    });
    if (!employee) return { employeeId: null, documents: [], allSent: false, allCompleted: false };

    const packages = await this.prisma.signaturePackage.findMany({
      where: { tenantId, employeeId: employee.id, externalProvider: 'DOCUSEAL' },
      select: { status: true, sentAt: true, signedAt: true, metadata: true },
    });
    const documents = hiringTemplateKeys.map((templateKey) => {
      const item = packages.find((entry) => this.packageTemplateKey(entry.metadata) === templateKey);
      return { templateKey, status: item?.status ?? 'NOT_CREATED', sentAt: item?.sentAt ?? null, signedAt: item?.signedAt ?? null };
    });
    return {
      employeeId: employee.id,
      documents,
      allSent: documents.every((document) => document.sentAt !== null),
      allCompleted: documents.every((document) => document.status === 'COMPLETED'),
    };
  }

  async createEmployeeSubmission(tenantId: string, actorId: string, employeeId: string, templateKey: string, sendEmail = true) {
    this.assertConfigured();
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId }, include: { branchAssignments: { where: { isPrimary: true, releasedAt: null }, take: 1 } } });
    if (!employee || !employee.branchAssignments[0]) throw new NotFoundException('Empleado no encontrado');
    const template = this.templates().find((item) => item.key === templateKey);
    if (!template) throw new BadRequestException('Plantilla DocuSeal no configurada');

    const response = await this.request<DocuSealSubmission[] | DocuSealSubmission>('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        template_id: template.id,
        send_email: sendEmail,
        submitters: [{ name: employee.name, email: employee.workEmail ?? employee.email, role: 'First Party', external_id: employee.id, metadata: { employeeId: employee.id, tenantId, templateKey } }],
      }),
    });
    const submitter = Array.isArray(response) ? response[0] : response;
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
    const publicBaseUrl = (process.env.DOCUSEAL_PUBLIC_URL ?? this.baseUrl.replace(/\/api$/, '')).replace(/\/$/, '');
    return { packageId: pkg.id, externalPackageId, templateKey, label: template.label, signingUrl: submitter?.submission_url ?? submitter?.url ?? (submitter?.slug ? `${publicBaseUrl}/s/${submitter.slug}` : template.url ?? null) };
  }

  private hiringEmailHtml(name: string, links: Array<{ label: string; url: string }>) {
    const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
    const buttons = links.map((link) => `<p><a href="${escape(link.url)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Completar ${escape(link.label)}</a></p>`).join('');
    return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><h2>Documentos necesarios para tu contratación</h2><p>Hola ${escape(name)},</p><p>Para continuar con tu contratación, completa los siguientes documentos:</p>${buttons}<p>Si ya completaste un documento, puedes volver a abrirlo desde el mismo botón.</p></div>`;
  }

  async handleWebhook(payload: { event_type?: string; data?: DocuSealSubmission & { submission_id?: number; email?: string; external_id?: string; audit_log_url?: string } }) {
    const event = payload.event_type ?? '';
    const data = (payload.data ?? {}) as DocuSealSubmission & { submission_id?: number; email?: string; external_id?: string; audit_log_url?: string };
    const externalPackageId = String(data.submission_id ?? data.id ?? '');
    if (!externalPackageId) return { ignored: true };
    const pkg = await this.prisma.signaturePackage.findFirst({ where: { externalProvider: 'DOCUSEAL', externalPackageId }, include: { employee: true } });
    if (!pkg) return { ignored: true };
    if (event === 'submission.completed' || event === 'form.completed') {
      if (pkg.status === 'COMPLETED') return { received: true, packageId: pkg.id, alreadyProcessed: true };
      await this.completePackage(pkg.id, data.documents, data.audit_log_url);
    }
    if (event === 'submission.expired') {
      await this.prisma.$transaction(async (tx) => {
        await tx.signaturePackage.update({ where: { id: pkg.id }, data: { status: 'CANCELLED' } });
        await tx.hiringContractSignatureRequest.updateMany({ where: { signaturePackageId: pkg.id }, data: { status: 'EXPIRED', respondedAt: new Date() } });
      });
    }
    return { received: true, packageId: pkg.id };
  }

  assertWebhookRequest(rawBody: Buffer | string | undefined, signature?: string, legacySecret?: string) {
    if (!this.webhookSecret) throw new BadRequestException('Webhook DocuSeal no configurado');
    if (signature) {
      const [timestamp, provided] = signature.split('.', 2);
      const raw = typeof rawBody === 'string' ? rawBody : rawBody?.toString('utf8');
      if (!timestamp || !provided || !raw || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new BadRequestException('Webhook DocuSeal expirado o inválido');
      const expected = createHmac('sha256', this.webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
      if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw new BadRequestException('Webhook DocuSeal no autorizado');
      return;
    }
    if (legacySecret !== this.webhookSecret) throw new BadRequestException('Webhook DocuSeal no autorizado');
  }

  private async completePackage(packageId: string, documentsFromWebhook?: Array<{ name?: string; url: string }>, auditLogUrl?: string) {
    const pkg = await this.prisma.signaturePackage.findUnique({ where: { id: packageId }, include: { employee: true, participants: true } });
    const employee = pkg?.employee;
    if (!pkg || !employee || pkg.status === 'COMPLETED') return;
    const response = documentsFromWebhook?.length
      ? { documents: documentsFromWebhook }
      : await this.request<{ documents?: Array<{ name?: string; url: string }> }>(`/submissions/${encodeURIComponent(pkg.externalPackageId!)}/documents?merge=true`);
    const document = response.documents?.[0];
    if (!document?.url) throw new ServiceUnavailableException('DocuSeal no devolvió el PDF firmado');
    const fileResponse = await fetch(document.url);
    if (!fileResponse.ok) throw new ServiceUnavailableException('No fue posible descargar el PDF firmado de DocuSeal');
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const stored = await this.storage.store(pkg.tenantId, employee.id, { originalname: `${pkg.title}.pdf`, mimetype: 'application/pdf', size: buffer.length, buffer } as Express.Multer.File);
    const templateKey = this.packageTemplateKey(pkg.metadata);
    const documentMeaning = templateKey === 'i9' ? 'I9' : templateKey === 'food-employee-reporting' ? 'FOOD_EMPLOYEE_REPORTING' : templateKey === 'w9' ? 'W9' : 'EMPLOYMENT_AGREEMENT';
    const documentCategory = documentMeaning;
    const requirementCode = documentMeaning === 'I9' ? 'I9' : documentMeaning === 'EMPLOYMENT_AGREEMENT' ? 'EMPLOYMENT_AGREEMENT' : null;
    await this.prisma.$transaction(async (tx) => {
      const employeeDocument = await tx.employeeDocument.create({ data: {
        tenantId: pkg.tenantId, branchId: pkg.branchId, employeeId: employee.id, category: documentCategory, originalName: `${pkg.title}.pdf`, storageKey: stored.key, mimeType: 'application/pdf', sizeBytes: buffer.length, checksum: stored.checksum, scanStatus: 'CLEAN', status: 'APPROVED', metadata: { source: 'docuseal', externalPackageId: pkg.externalPackageId, templateKey, documentMeaning },
      } });
      if (requirementCode) await tx.employeeComplianceRequirement.updateMany({ where: { tenantId: pkg.tenantId, employeeId: employee.id, code: requirementCode }, data: { status: 'COMPLETE', completedAt: new Date(), documentId: employeeDocument.id, source: 'MANUAL' } });
      await tx.signaturePackage.update({ where: { id: pkg.id }, data: { status: 'COMPLETED', signedAt: new Date() } });
      await tx.hiringContractSignatureRequest.updateMany({ where: { signaturePackageId: pkg.id }, data: { status: 'COMPLETED', completedAt: new Date(), evidence: { externalPackageId: pkg.externalPackageId, auditLogUrl: auditLogUrl ?? null, documentId: employeeDocument.id } } });
      await tx.hiringContract.updateMany({ where: { employeeId: employee.id, status: 'SIGNATURES_PENDING', isActive: true }, data: { status: 'COMPLIANCE_REVIEW', currentStage: 'compliance_review', nextAction: 'Review signed documents', nextActor: 'HR' } });
      await tx.signatureParticipant.updateMany({ where: { packageId: pkg.id }, data: { status: 'SIGNED', signedAt: new Date(), consentedAt: new Date() } });
      await tx.signatureAuditEvent.create({ data: { tenantId: pkg.tenantId, packageId: pkg.id, action: 'DOCUSEAL_SUBMISSION_COMPLETED', outcome: 'SUCCESS', evidence: { documentId: employeeDocument.id, checksum: createHash('sha256').update(buffer).digest('hex'), auditLogUrl: auditLogUrl ?? null } } });
    });
  }

  private packageTemplateKey(metadata: unknown) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof (metadata as { templateKey?: unknown }).templateKey === 'string') {
      return (metadata as { templateKey: string }).templateKey;
    }
    return 'employment-agreement';
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
