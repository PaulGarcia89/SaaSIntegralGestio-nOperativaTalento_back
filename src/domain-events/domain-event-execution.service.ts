import { Injectable, Logger } from '@nestjs/common';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  DOMAIN_EVENT_CATALOG,
  DomainEventName,
  PersistedDomainEventPayload,
} from './domain-event.constants';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventHandlerRegistryService } from './event-handler-registry.service';
import { DomainEventQueueJobPayload } from './domain-event-job.types';
import { DomainEventSecurityService } from './domain-event-security.service';
import { IntegrationEventTrackingService } from './integration-event-tracking.service';

type EventProcessingRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  correlationId: string | null;
  causationId: string | null;
  idempotencyKey: string | null;
  eventName: string;
  eventVersion: number;
  payload: Prisma.JsonValue;
  status: OutboxEventStatus;
  retryCount: number;
  maxAttempts: number;
  occurredAt: Date;
};

type ProcessingContext = {
  dispatchId?: string | null;
  queueName: string;
  consumerName: string;
  jobId?: string | null;
};

@Injectable()
export class DomainEventExecutionService {
  private readonly logger = new Logger(DomainEventExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlerRegistry: EventHandlerRegistryService,
    private readonly securityService: DomainEventSecurityService,
    private readonly trackingService: IntegrationEventTrackingService,
  ) {}

  async processQueuedJob(job: DomainEventQueueJobPayload, jobId?: string | null) {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: job.outboxEventId },
    });

    if (!event) {
      this.logger.warn(
        JSON.stringify({
          message: 'Outbox event no longer exists for queued job',
          eventId: job.outboxEventId,
          jobId: jobId ?? null,
          queueName: job.queueName,
          tenantId: job.tenantId,
          branchId: job.branchId,
          correlationId: job.correlationId,
        }),
      );
      return null;
    }

    this.securityService.validateQueuedJob(job, event);

    return this.processByEventRecord(event, {
      dispatchId: job.dispatchId,
      queueName: job.queueName,
      consumerName: `domain-event-worker:${job.queueName}`,
      jobId: jobId ?? null,
    });
  }

  async processByEventRecord(event: EventProcessingRecord, context: ProcessingContext) {
    if (event.status === OutboxEventStatus.PROCESSED) {
      return null;
    }

    try {
      this.logger.log(
        JSON.stringify({
          message: 'Processing domain event job',
          eventId: event.id,
          eventName: event.eventName,
          queueName: context.queueName,
          consumerName: context.consumerName,
          jobId: context.jobId ?? null,
          dispatchId: context.dispatchId ?? null,
          tenantId: event.tenantId,
          branchId: event.branchId,
          correlationId: event.correlationId,
        }),
      );

      await this.trackingService.markWorkerStarted({
        event,
        dispatchId: context.dispatchId,
        consumerName: context.consumerName,
        jobId: context.jobId ?? null,
      });

      const payload = this.securityService.parseAndValidatePayload(event, event.payload);
      const handler = this.handlerRegistry.resolve(event.eventName as DomainEventName);

      if (!handler) {
        throw new Error(`No handler registered for ${event.eventName}`);
      }

      const catalogEntry = DOMAIN_EVENT_CATALOG[event.eventName as DomainEventName];
      if (!catalogEntry || catalogEntry.version !== event.eventVersion) {
        throw new Error(
          `Unsupported event version for ${event.eventName}: ${event.eventVersion}`,
        );
      }

      const executionActor = this.securityService.buildExecutionActor(event, payload.actor);
      const result = await handler(executionActor, payload.dto);

      this.logger.log(
        JSON.stringify({
          message: 'Domain event job processed successfully',
          eventId: event.id,
          eventName: event.eventName,
          queueName: context.queueName,
          consumerName: context.consumerName,
          jobId: context.jobId ?? null,
          dispatchId: context.dispatchId ?? null,
          tenantId: event.tenantId,
          branchId: event.branchId,
          correlationId: event.correlationId,
          actorUserId: executionActor.sub ?? executionActor.userId ?? null,
        }),
      );

      await this.trackingService.markProcessed({
        event,
        dispatchId: context.dispatchId,
        consumerName: context.consumerName,
        queueName: context.queueName,
        jobId: context.jobId ?? null,
        result,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown queued event processing error';
      await this.trackingService.markProcessingFailed({
        event,
        dispatchId: context.dispatchId ?? '',
        queueName: context.queueName,
        errorMessage: message,
        nextRetryAt: this.calculateNextRetryAt(event.retryCount),
      });

      this.logger.warn(
        JSON.stringify({
          message: 'Domain event job failed',
          eventId: event.id,
          eventName: event.eventName,
          queueName: context.queueName,
          consumerName: context.consumerName,
          jobId: context.jobId ?? null,
          dispatchId: context.dispatchId ?? null,
          tenantId: event.tenantId,
          branchId: event.branchId,
          correlationId: event.correlationId,
          error: message,
        }),
      );
      throw error;
    }
  }

  private calculateNextRetryAt(retryCount: number) {
    const retryDelayMs = Math.min(60_000, 15_000 * Math.max(1, retryCount));
    return new Date(Date.now() + retryDelayMs);
  }
}
