import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxEventStatus } from '@prisma/client';
import { hostname } from 'os';
import { PrismaService } from '../common/prisma/prisma.service';
import { MessageBusPort } from '../messaging/message-bus.port';
import { MESSAGE_BUS } from '../messaging/message-bus.tokens';
import { DomainEventName } from './domain-event.constants';
import { DomainEventExecutionService } from './domain-event-execution.service';
import { DomainEventQueueJobPayload } from './domain-event-job.types';
import { DomainEventRoutingService } from './domain-event-routing.service';
import { IntegrationEventTrackingService } from './integration-event-tracking.service';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly workerId = `${hostname()}:${process.pid}`;
  private readonly pollIntervalMs = 5_000;
  private timer: NodeJS.Timeout | null = null;
  private isDraining = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_BUS) private readonly messageBus: MessageBusPort,
    private readonly routingService: DomainEventRoutingService,
    private readonly executionService: DomainEventExecutionService,
    private readonly trackingService: IntegrationEventTrackingService,
  ) {}

  onModuleInit() {
    if (process.env.OUTBOX_DISPATCHER_ENABLED === 'false') return;
    this.timer = setInterval(() => {
      void this.recoverStaleProcessingEvents();
      void this.drainPendingEvents();
    }, this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispatchEventById(eventId: string) {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findUnique({
        where: { id: eventId },
      });

      if (
        !event ||
        (event.status !== OutboxEventStatus.PENDING && event.status !== OutboxEventStatus.FAILED)
      ) {
        return null;
      }

      const updateResult = await tx.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: event.status,
        },
        data: {
          status: OutboxEventStatus.PROCESSING,
          retryCount: { increment: 1 },
          lockedAt: new Date(),
          processingNode: this.workerId,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      return tx.outboxEvent.findUnique({
        where: { id: event.id },
      });
    });

    if (!claimed) {
      return null;
    }

    this.logger.log(
      JSON.stringify({
        message: 'Dispatching outbox event',
        eventId: claimed.id,
        eventName: claimed.eventName,
        tenantId: claimed.tenantId,
        branchId: claimed.branchId,
        correlationId: claimed.correlationId,
        retryCount: claimed.retryCount,
      }),
    );

    const queueName = this.routingService.resolveQueue(claimed.eventName as DomainEventName);
    const dispatch = await this.trackingService.createDispatchAttempt(
      claimed,
      queueName,
      claimed.eventName,
    );

    if (!this.messageBus.isEnabled()) {
      this.logger.warn(
        JSON.stringify({
          message: 'Message bus no configurado; procesando evento inline',
          eventId: claimed.id,
          queueName,
          driver: this.messageBus.getDriverName(),
          tenantId: claimed.tenantId,
          branchId: claimed.branchId,
          correlationId: claimed.correlationId,
        }),
      );
      await this.trackingService.markDispatchQueued({
        event: claimed,
        dispatchId: dispatch.id,
        jobId: `inline:${claimed.id}`,
        queueName,
      });

      return this.executionService.processByEventRecord(claimed, {
        dispatchId: dispatch.id,
        queueName,
        consumerName: 'inline-fallback',
        jobId: `inline:${claimed.id}`,
      });
    }

    const payload: DomainEventQueueJobPayload = {
      outboxEventId: claimed.id,
      dispatchId: dispatch.id,
      queueName,
      eventName: claimed.eventName as DomainEventName,
      eventVersion: claimed.eventVersion,
      tenantId: claimed.tenantId,
      branchId: claimed.branchId,
      correlationId: claimed.correlationId,
      causationId: claimed.causationId,
      idempotencyKey: claimed.idempotencyKey,
      retryCount: claimed.retryCount,
    };

    try {
      const published = await this.messageBus.publish({
        queueName,
        jobName: claimed.eventName,
        payload,
        options: {
          jobId: dispatch.id,
        },
      });

      await this.trackingService.markDispatchQueued({
        event: claimed,
        dispatchId: dispatch.id,
        jobId: String(published?.jobId ?? dispatch.id),
        queueName,
      });

      return {
        eventId: claimed.id,
        dispatchId: dispatch.id,
        queueName,
        queued: true,
        jobId: published?.jobId ?? null,
        status: claimed.status,
        retryCount: claimed.retryCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown queue dispatch error';
      this.logger.error(
        JSON.stringify({
          message: 'Queue dispatch failed',
          eventId: claimed.id,
          dispatchId: dispatch.id,
          queueName,
          tenantId: claimed.tenantId,
          branchId: claimed.branchId,
          correlationId: claimed.correlationId,
          error: message,
        }),
      );
      await this.trackingService.markDispatchFailed({
        event: claimed,
        dispatchId: dispatch.id,
        queueName,
        errorMessage: message,
        nextRetryAt: this.calculateNextRetryAt(claimed.retryCount),
      });

      throw error;
    }
  }

  async drainPendingEvents(limit = 25) {
    if (this.isDraining) {
      return;
    }

    this.isDraining = true;

    try {
      const candidates = await this.prisma.outboxEvent.findMany({
        where: {
          status: { in: [OutboxEventStatus.PENDING, OutboxEventStatus.FAILED] },
          nextRetryAt: { lte: new Date() },
          retryCount: { lt: 10 },
        },
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });

      for (const candidate of candidates) {
        await this.dispatchEventById(candidate.id);
      }
    } finally {
      this.isDraining = false;
    }
  }

  async recoverStaleProcessingEvents() {
    const staleBefore = new Date(Date.now() - 5 * 60_000);

    const staleEvents = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxEventStatus.PROCESSING,
        lockedAt: { lt: staleBefore },
      },
    });

    if (staleEvents.length === 0) {
      return;
    }

    this.logger.warn(
      JSON.stringify({
        message: 'Recovering stale processing outbox events',
        count: staleEvents.length,
        eventIds: staleEvents.map((event) => event.id),
      }),
    );

    await this.prisma.outboxEvent.updateMany({
      where: {
        id: { in: staleEvents.map((event) => event.id) },
      },
      data: {
        status: OutboxEventStatus.FAILED,
        lockedAt: null,
        processingNode: null,
        nextRetryAt: new Date(),
        lastError: 'Recovered stale processing event',
      },
    });

    await Promise.all(
      staleEvents.map((event) => this.trackingService.recordRecoveredStaleProcessing(event)),
    );
  }

  private calculateNextRetryAt(retryCount: number) {
    const retryDelayMs = Math.min(60_000, 15_000 * Math.max(1, retryCount));
    return new Date(Date.now() + retryDelayMs);
  }
}
