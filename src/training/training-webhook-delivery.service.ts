import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { QueueManagerService } from '../messaging/queue-manager.service';
import { MESSAGE_QUEUE_NAMES } from '../messaging/messaging.constants';
import { MessageBusWorkerHandle } from '../messaging/messaging.types';
import { PrismaService } from '../common/prisma/prisma.service';

type WebhookJob = { deliveryId: string };

@Injectable()
export class TrainingWebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrainingWebhookDeliveryService.name);
  private worker: MessageBusWorkerHandle | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueManagerService) {}

  onModuleInit() {
    this.worker = this.queues.subscribe<WebhookJob>(MESSAGE_QUEUE_NAMES.TRAINING_WEBHOOK, ({ payload }) => this.deliver(payload.deliveryId), { concurrency: 3 });
    void this.recoverPending();
    this.recoveryTimer = setInterval(() => void this.recoverPending(), 60_000);
  }
  async onModuleDestroy() {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await this.worker?.close();
  }

  encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  async assertPublicEndpoint(endpointUrl: string) {
    const url = new URL(endpointUrl);
    if (url.protocol !== 'https:') throw new BadRequestException('Webhook endpoint must use HTTPS');
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) throw new BadRequestException('Webhook endpoint must resolve to a public address');
  }

  async publish(tenantId: string, eventType: string, payload: Record<string, unknown>, eventId: string = randomUUID(), includeAll = false) {
    const webhooks = await this.prisma.trainingWebhook.findMany({ where: { tenantId, isActive: true, ...(includeAll ? {} : { eventTypes: { has: eventType } }), secretEncrypted: { not: null } } });
    const created = await Promise.all(webhooks.map((webhook) => this.prisma.trainingWebhookDelivery.upsert({
      where: { webhookId_eventId: { webhookId: webhook.id, eventId } },
      create: { tenantId, webhookId: webhook.id, eventType, eventId, payload: payload as Prisma.InputJsonValue },
      update: {},
    })));
    await Promise.all(created.map((delivery) => this.enqueue(delivery.id)));
    return { eventId, queued: created.length };
  }

  async retry(tenantId: string, deliveryId: string) {
    const updated = await this.prisma.trainingWebhookDelivery.updateMany({ where: { id: deliveryId, tenantId }, data: { status: 'PENDING', nextAttemptAt: new Date(), lastError: null } });
    if (updated.count) await this.enqueue(deliveryId);
    return { queued: updated.count === 1 };
  }

  private async enqueue(deliveryId: string) {
    const queued = await this.queues.addJob({ queueName: MESSAGE_QUEUE_NAMES.TRAINING_WEBHOOK, jobName: 'deliver-training-webhook', payload: { deliveryId }, options: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 200, removeOnFail: 500 } });
    if (!queued) await this.deliver(deliveryId);
  }

  async recoverPending(now = new Date(), tenantId?: string) {
    const pending = await this.prisma.trainingWebhookDelivery.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await Promise.all(pending.map(item => this.enqueue(item.id)));
    return { recovered: pending.length };
  }

  private async deliver(deliveryId: string) {
    const now = new Date();
    const claimed = await this.prisma.trainingWebhookDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] },
        OR: [
          { status: { in: ['PENDING', 'RETRYING'] }, nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
      },
      data: {
        status: 'PROCESSING',
        nextAttemptAt: new Date(now.getTime() + 2 * 60_000),
      },
    });
    if (!claimed.count) return;
    const delivery = await this.prisma.trainingWebhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
    if (!delivery || !delivery.webhook.isActive || !delivery.webhook.secretEncrypted) return;
    await this.assertPublicEndpoint(delivery.webhook.endpointUrl);
    const body = JSON.stringify({ id: delivery.eventId, type: delivery.eventType, occurredAt: delivery.createdAt.toISOString(), tenantId: delivery.tenantId, data: delivery.payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', this.decryptSecret(delivery.webhook.secretEncrypted)).update(`${timestamp}.${body}`).digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(delivery.webhook.endpointUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'TalentOS-Training-Webhook/1.0', 'x-talentos-event': delivery.eventType, 'x-talentos-delivery': delivery.id, 'x-talentos-timestamp': timestamp, 'x-talentos-signature': `v1=${signature}` }, body, signal: controller.signal, redirect: 'error' });
      const attemptCount = delivery.attemptCount + 1;
      if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}`);
      await this.prisma.$transaction([
        this.prisma.trainingWebhookDelivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', attemptCount, responseStatus: response.status, deliveredAt: new Date(), lastError: null, nextAttemptAt: null } }),
        this.prisma.trainingWebhook.update({ where: { id: delivery.webhookId }, data: { lastStatus: 'DELIVERED', lastError: null, lastDeliveryAt: new Date() } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Webhook delivery failed';
      const attemptCount = delivery.attemptCount + 1;
      const terminal = attemptCount >= 5;
      await this.prisma.$transaction([
        this.prisma.trainingWebhookDelivery.update({ where: { id: delivery.id }, data: { status: terminal ? 'FAILED' : 'RETRYING', attemptCount, lastError: message, nextAttemptAt: terminal ? null : new Date(Date.now() + 5_000 * 2 ** attemptCount) } }),
        this.prisma.trainingWebhook.update({ where: { id: delivery.webhookId }, data: { lastStatus: terminal ? 'FAILED' : 'RETRYING', lastError: message } }),
      ]);
      this.logger.warn(`Webhook delivery ${delivery.id} failed: ${message}`);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private decryptSecret(value: string) {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
  private key() { return createHash('sha256').update(process.env.WEBHOOK_ENCRYPTION_KEY ?? process.env.JWT_REFRESH_SECRET ?? 'development-only-key').digest(); }
  private isPrivateAddress(address: string) {
    if (!isIP(address)) return true;
    return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:') || /^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  }
}
