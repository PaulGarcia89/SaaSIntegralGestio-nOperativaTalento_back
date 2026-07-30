import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';
import { TrainingScormStorageService } from './training-scorm-storage.service';
import { CreateScormPackageDto, CreateTrainingSessionDto, CreateTrainingWebhookDto, CreateXapiStatementDto } from './dto/training-integrations.dto';
@Injectable()
export class TrainingIntegrationsService {
  constructor(private readonly prisma: PrismaService, private readonly webhookDelivery: TrainingWebhookDeliveryService, private readonly scormStorage: TrainingScormStorageService) {}
  async overview(tenantId: string) {
    const [packages, statements, webhooks, sessions, resources, recommendations] = await Promise.all([
      this.prisma.trainingScormPackage.findMany({ where: { tenantId }, include: { course: { select: { title: true } }, _count: { select: { sessions: true } } }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.trainingXapiStatement.count({ where: { tenantId } }),
      this.prisma.trainingWebhook.findMany({ where: { tenantId }, select: { id: true, name: true, endpointUrl: true, eventTypes: true, isActive: true, secretEncrypted: true, lastStatus: true, lastError: true, lastDeliveryAt: true } }),
      this.prisma.trainingEvent.findMany({ where: { tenantId, startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 20 }),
      this.prisma.trainingLibraryResource.count({ where: { OR: [{ tenantId }, { tenantId: null }], isPublished: true } }),
      this.prisma.trainingRecommendation.findMany({ where: { tenantId, status: 'SUGGESTED' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const [deliveries, usage] = await Promise.all([
      this.prisma.trainingWebhookDelivery.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, eventType: true, status: true, attemptCount: true, responseStatus: true, lastError: true, createdAt: true, deliveredAt: true, webhook: { select: { name: true } } } }),
      this.prisma.trainingScormPackage.aggregate({ where: { tenantId }, _sum: { fileSize: true }, _count: true }),
    ]);
    const failedDeliveries = await this.prisma.trainingWebhookDelivery.count({ where: { tenantId, status: 'FAILED' } });
    return { packages, xapiStatements: statements, webhooks: webhooks.map(({ secretEncrypted, ...webhook }) => ({ ...webhook, deliveryReady: Boolean(secretEncrypted) })), deliveries, sessions, resources, recommendations, operations: { ...this.scormStorage.health(), usage: { bytes: usage._sum.fileSize ?? 0, packages: usage._count }, webhooks: { failedDeliveries } } };
  }
  createPackage(tenantId: string, actorId: string, dto: CreateScormPackageDto) {
    return this.prisma.trainingScormPackage.create({ data: { tenantId, createdById: actorId, ...dto, manifest: { validated: true, standard: dto.version } } });
  }
  async createWebhook(tenantId: string, actorId: string, dto: CreateTrainingWebhookDto) {
    await this.webhookDelivery.assertPublicEndpoint(dto.endpointUrl);
    return this.prisma.trainingWebhook.create({ data: { tenantId, createdById: actorId, name: dto.name, endpointUrl: dto.endpointUrl, eventTypes: dto.eventTypes, secretHash: createHash('sha256').update(dto.secret).digest('hex'), secretEncrypted: this.webhookDelivery.encryptSecret(dto.secret) }, select: { id: true, name: true, endpointUrl: true, eventTypes: true, isActive: true } });
  }
  recordXapi(tenantId: string, userId: string, dto: CreateXapiStatementDto) {
    return this.prisma.trainingXapiStatement.create({ data: { id: randomUUID(), tenantId, userId, statementId: dto.statementId, verb: dto.verb, objectId: dto.objectId, result: dto.result as Prisma.InputJsonValue | undefined, context: dto.context as Prisma.InputJsonValue | undefined, occurredAt: new Date(dto.occurredAt) } });
  }
  createSession(tenantId: string, dto: CreateTrainingSessionDto) {
    return this.prisma.trainingEvent.create({ data: { tenantId, title: dto.title, startsAt: new Date(dto.startsAt), endsAt: dto.endsAt ? new Date(dto.endsAt) : null, meetingUrl: dto.meetingUrl, timeZone: dto.timeZone, modality: 'VIRTUAL', relatedCourseId: dto.courseId } });
  }
  decideRecommendation(tenantId: string, actorId: string, id: string, status: 'ACCEPTED' | 'DISMISSED') {
    return this.prisma.trainingRecommendation.updateMany({ where: { id, tenantId, status: 'SUGGESTED' }, data: { status, decidedById: actorId, decidedAt: new Date() } });
  }
  testWebhook(tenantId: string) {
    return this.webhookDelivery.publish(tenantId, 'webhook.test', { message: 'TalentOS webhook connectivity test' }, randomUUID(), true);
  }
  retryWebhook(tenantId: string, deliveryId: string) {
    return this.webhookDelivery.retry(tenantId, deliveryId);
  }
  rotateWebhookSecret(tenantId: string, webhookId: string, secret: string) {
    return this.prisma.trainingWebhook.updateMany({ where: { id: webhookId, tenantId }, data: { secretHash: createHash('sha256').update(secret).digest('hex'), secretEncrypted: this.webhookDelivery.encryptSecret(secret), lastStatus: 'SECRET_ROTATED', lastError: null } });
  }
}
