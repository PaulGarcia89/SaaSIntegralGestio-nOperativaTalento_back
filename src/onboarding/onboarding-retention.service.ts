import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingDocumentStorageService } from './onboarding-document-storage.service';

@Injectable()
export class OnboardingRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly storage: OnboardingDocumentStorageService) {}

  onModuleInit() {
    if (process.env.ONBOARDING_RETENTION_ENABLED === 'false') return;
    const interval = Math.max(Number(process.env.ONBOARDING_RETENTION_POLL_MS ?? 86_400_000), 60_000);
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async inspect() {
    const [approvedPolicies, drafts, activeHolds] = await Promise.all([
      this.prisma.onboardingRetentionPolicy.count({ where: { isActive: true, legalReviewStatus: 'APPROVED' } }),
      this.prisma.onboardingRetentionPolicy.count({ where: { isActive: true, legalReviewStatus: { not: 'APPROVED' } } }),
      this.prisma.onboardingLegalHold.count({ where: { status: 'ACTIVE' } }),
    ]);
    return { enabled: process.env.ONBOARDING_RETENTION_ENABLED !== 'false', driver: this.storage.driver, approvedPolicies, drafts, activeHolds, processing: this.running };
  }

  async run() {
    if (this.running) return { skipped: true, reason: 'ALREADY_RUNNING', deleted: 0, held: 0, failed: 0 };
    this.running = true;
    try {
      const policies = await this.prisma.onboardingRetentionPolicy.findMany({ where: { isActive: true, legalReviewStatus: 'APPROVED' }, take: 500 });
      let deleted = 0; let held = 0; let failed = 0;
      for (const policy of policies) {
        const before = new Date(Date.now() - policy.retentionDays * 86_400_000);
        const documents = await this.prisma.employeeDocument.findMany({ where: { tenantId: policy.tenantId, category: policy.documentCategory, createdAt: { lt: before }, deletedAt: null }, include: { onboardingFlow: { include: { legalHolds: { where: { status: 'ACTIVE' }, select: { id: true } } } } }, take: Math.min(Number(process.env.ONBOARDING_RETENTION_BATCH_SIZE ?? 100), 500) });
        for (const document of documents) {
          if (document.onboardingFlow?.legalHolds.length) { held++; continue; }
          try {
            await this.storage.delete(document.storageKey);
            await this.prisma.employeeDocument.update({ where: { id: document.id }, data: { deletedAt: new Date(), status: 'DELETED', metadata: { ...(this.object(document.metadata)), retentionPolicyId: policy.id, retentionDeletedAt: new Date().toISOString() } } });
            deleted++;
          } catch (error) { failed++; this.logger.error(`No fue posible depurar el documento ${document.id}`, error instanceof Error ? error.message : String(error)); }
        }
      }
      return { skipped: false, deleted, held, failed, ...(await this.inspect()) };
    } finally { this.running = false; }
  }

  private object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
}
