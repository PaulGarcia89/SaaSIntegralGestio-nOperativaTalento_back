import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AtsFileStatus, NotificationCategory, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AtsPrivateFileService } from './ats-private-file.service';

const GIB = 1024 ** 3;
const RETAINED_STATUSES: AtsFileStatus[] = [
  AtsFileStatus.ACTIVE,
  AtsFileStatus.SUPERSEDED,
  AtsFileStatus.QUARANTINED,
];

@Injectable()
export class AtsStorageOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AtsStorageOperationsService.name);
  private maintenanceTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: AtsPrivateFileService,
  ) {}

  onModuleInit() {
    if (process.env.ATS_STORAGE_MAINTENANCE_ENABLED === 'false') return;
    const interval = Math.max(Number(process.env.ATS_STORAGE_MAINTENANCE_POLL_MS ?? 21_600_000), 60_000);
    this.maintenanceTimer = setInterval(() => void this.runMaintenance(), interval);
    this.maintenanceTimer.unref();
    setTimeout(() => void this.runMaintenance(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  async inspect() {
    const [resume, images, dueResume, dueImages] = await Promise.all([
      this.prisma.candidateResumeFile.aggregate({
        where: { status: { in: RETAINED_STATUSES } },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      this.prisma.vacancyImageFile.aggregate({
        where: { status: { in: RETAINED_STATUSES } },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      this.prisma.candidateResumeFile.count({
        where: { status: { in: RETAINED_STATUSES }, retainUntil: { lte: new Date() } },
      }),
      this.prisma.vacancyImageFile.count({
        where: { status: { in: RETAINED_STATUSES }, retainUntil: { lte: new Date() } },
      }),
    ]);
    const usedBytes = Number(resume._sum.sizeBytes ?? 0) + Number(images._sum.sizeBytes ?? 0);
    const alertBytes = this.positiveNumber('ATS_FILE_STORAGE_ALERT_BYTES', 8 * GIB);
    const freeTierBytes = this.positiveNumber('ATS_FILE_STORAGE_FREE_TIER_BYTES', 10 * GIB);
    return {
      generatedAt: new Date().toISOString(),
      configuration: this.files.storageConfiguration(),
      usage: {
        usedBytes,
        alertBytes,
        freeTierBytes,
        usedPercentOfFreeTier: Number(((usedBytes / freeTierBytes) * 100).toFixed(2)),
        alertReached: usedBytes >= alertBytes,
        bytesUntilAlert: Math.max(alertBytes - usedBytes, 0),
        files: Number(resume._count._all) + Number(images._count._all),
        resumes: { files: resume._count._all, bytes: Number(resume._sum.sizeBytes ?? 0) },
        vacancyImages: { files: images._count._all, bytes: Number(images._sum.sizeBytes ?? 0) },
      },
      retention: {
        enabled: process.env.ATS_STORAGE_MAINTENANCE_ENABLED !== 'false',
        resumeDays: this.positiveNumber('ATS_RESUME_RETENTION_DAYS', 730),
        vacancyImageDays: this.positiveNumber('ATS_VACANCY_IMAGE_RETENTION_DAYS', 365),
        pendingExpiration: dueResume + dueImages,
      },
    };
  }

  async runMaintenance() {
    if (this.running) return {
      skipped: true,
      reason: 'ALREADY_RUNNING',
      expiredResumes: 0,
      expiredImages: 0,
      ...(await this.inspect()),
    };
    this.running = true;
    try {
      const [expiredResumes, expiredImages] = await Promise.all([
        this.purgeExpired('resume'),
        this.purgeExpired('vacancy-image'),
      ]);
      const report = await this.inspect();
      await this.notifyStorageThreshold(report.usage.usedBytes, report.usage.alertBytes);
      return { skipped: false, expiredResumes, expiredImages, ...report };
    } catch (error) {
      this.logger.error('ATS storage maintenance failed', error instanceof Error ? error.stack : String(error));
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async purgeExpired(kind: 'resume' | 'vacancy-image') {
    const repository = kind === 'resume'
      ? this.prisma.candidateResumeFile
      : this.prisma.vacancyImageFile;
    const records = await (repository as typeof this.prisma.candidateResumeFile).findMany({
      where: { status: { in: RETAINED_STATUSES }, retainUntil: { lte: new Date() } },
      orderBy: { retainUntil: 'asc' },
      take: Math.min(this.positiveNumber('ATS_STORAGE_RETENTION_BATCH_SIZE', 100), 500),
      select: { id: true, storageKey: true },
    });
    let expired = 0;
    for (const record of records) {
      try {
        await this.files.delete(record.storageKey);
        await (repository as typeof this.prisma.candidateResumeFile).updateMany({
          where: { id: record.id, status: { in: RETAINED_STATUSES } },
          data: {
            status: AtsFileStatus.EXPIRED,
            deletedAt: new Date(),
            deletionReason: 'Retención automática vencida',
          },
        });
        expired += 1;
      } catch (error) {
        this.logger.warn(`Could not expire ATS file ${record.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return expired;
  }

  private async notifyStorageThreshold(usedBytes: number, alertBytes: number) {
    if (usedBytes < alertBytes) return;
    this.logger.warn(`ATS private storage reached its alert threshold: ${usedBytes}/${alertBytes} bytes`);
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { isSuperAdmin: true },
          { userRoles: { some: { role: { code: { in: ['SUPERADMIN', 'PLATFORM_ADMIN'] } } } } },
        ],
      },
      select: { id: true, tenantId: true },
    });
    await Promise.all(users.map((user) => this.prisma.notification.upsert({
      where: {
        tenantId_userId_deduplicationKey: {
          tenantId: user.tenantId,
          userId: user.id,
          deduplicationKey: `ats-storage-threshold:${alertBytes}`,
        },
      },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        type: NotificationType.WARNING,
        category: NotificationCategory.SECURITY,
        title: 'Almacenamiento ATS cerca del límite gratuito',
        message: `El almacenamiento privado alcanzó ${(usedBytes / GIB).toFixed(2)} GB. Revisa la retención antes de superar el nivel gratuito.`,
        sourceModule: 'ats-storage',
        actionUrl: '/admin/queues',
        deduplicationKey: `ats-storage-threshold:${alertBytes}`,
        payload: { usedBytes, alertBytes },
      },
      update: {
        message: `El almacenamiento privado alcanzó ${(usedBytes / GIB).toFixed(2)} GB. Revisa la retención antes de superar el nivel gratuito.`,
        payload: { usedBytes, alertBytes },
        readAt: null,
        archivedAt: null,
        deletedAt: null,
      },
    })));
  }

  private positiveNumber(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
