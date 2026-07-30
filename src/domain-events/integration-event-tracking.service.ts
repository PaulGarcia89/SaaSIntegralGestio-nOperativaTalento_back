import { Injectable } from '@nestjs/common';
import { IntegrationEventStatus, OutboxDispatchStatus, OutboxEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type PrismaLikeClient = PrismaService | Prisma.TransactionClient;

type DispatchFailureInput = {
  event: Pick<
    OutboxEvent,
    | 'id'
    | 'tenantId'
    | 'branchId'
    | 'eventName'
    | 'eventVersion'
    | 'payload'
    | 'retryCount'
    | 'maxAttempts'
    | 'correlationId'
  >;
  dispatchId: string;
  queueName: string;
  errorMessage: string;
  nextRetryAt: Date;
};

type ProcessingFailureInput = DispatchFailureInput;

@Injectable()
export class IntegrationEventTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async recordPublished(event: OutboxEvent, client?: PrismaLikeClient) {
    return this.getClient(client).integrationEventLog.create({
      data: {
        outboxEventId: event.id,
        tenantId: event.tenantId,
        branchId: event.branchId,
        eventName: event.eventName,
        eventVersion: event.eventVersion,
        status: IntegrationEventStatus.PUBLISHED,
        summary: `Evento ${event.eventName} publicado en outbox`,
        payload: this.toJson({
          correlationId: event.correlationId,
          idempotencyKey: event.idempotencyKey,
        }),
        correlationId: event.correlationId,
        occurredAt: new Date(),
      },
    });
  }

  async createDispatchAttempt(
    event: Pick<OutboxEvent, 'id' | 'tenantId' | 'branchId' | 'eventName' | 'eventVersion' | 'correlationId'>,
    queueName: string,
    jobName: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const dispatchAttempt = (await tx.outboxEventDispatch.count({
        where: { outboxEventId: event.id },
      })) + 1;

      const dispatch = await tx.outboxEventDispatch.create({
        data: {
          outboxEventId: event.id,
          tenantId: event.tenantId,
          branchId: event.branchId,
          queueName,
          jobName,
          dispatchAttempt,
          correlationId: event.correlationId,
        },
      });

      await tx.integrationEventLog.create({
        data: {
          outboxEventId: event.id,
          dispatchId: dispatch.id,
          tenantId: event.tenantId,
          branchId: event.branchId,
          eventName: event.eventName,
          eventVersion: event.eventVersion,
          status: IntegrationEventStatus.DISPATCH_PENDING,
          summary: `Dispatch ${dispatchAttempt} creado para la cola ${queueName}`,
          payload: this.toJson({
            dispatchAttempt,
            queueName,
            jobName,
          }),
          correlationId: event.correlationId,
          occurredAt: new Date(),
        },
      });

      return dispatch;
    });
  }

  async markDispatchQueued(params: {
    event: Pick<OutboxEvent, 'id' | 'tenantId' | 'branchId' | 'eventName' | 'eventVersion' | 'correlationId'>;
    dispatchId: string;
    jobId: string | null;
    queueName: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.outboxEventDispatch.update({
        where: { id: params.dispatchId },
        data: {
          status: OutboxDispatchStatus.QUEUED,
          jobId: params.jobId,
          dispatchedAt: new Date(),
        },
      });

      await tx.outboxEvent.update({
        where: { id: params.event.id },
        data: {
          lockedAt: null,
          processingNode: null,
        },
      });

      await tx.integrationEventLog.create({
        data: {
          outboxEventId: params.event.id,
          dispatchId: params.dispatchId,
          tenantId: params.event.tenantId,
          branchId: params.event.branchId,
          eventName: params.event.eventName,
          eventVersion: params.event.eventVersion,
          status: IntegrationEventStatus.DISPATCHED,
          summary: `Evento encolado en ${params.queueName}`,
          payload: this.toJson({
            queueName: params.queueName,
            jobId: params.jobId,
          }),
          correlationId: params.event.correlationId,
          occurredAt: new Date(),
        },
      });
    });
  }

  async markWorkerStarted(params: {
    event: Pick<OutboxEvent, 'id' | 'tenantId' | 'branchId' | 'eventName' | 'eventVersion' | 'correlationId'>;
    dispatchId?: string | null;
    consumerName: string;
    jobId?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (params.dispatchId) {
        await tx.outboxEventDispatch.update({
          where: { id: params.dispatchId },
          data: {
            status: OutboxDispatchStatus.ACKNOWLEDGED,
            acknowledgedAt: new Date(),
            jobId: params.jobId ?? undefined,
          },
        });
      }

      await tx.outboxEvent.update({
        where: { id: params.event.id },
        data: {
          lockedAt: new Date(),
          processingNode: params.consumerName,
        },
      });

      await tx.integrationEventLog.create({
        data: {
          outboxEventId: params.event.id,
          dispatchId: params.dispatchId ?? null,
          tenantId: params.event.tenantId,
          branchId: params.event.branchId,
          eventName: params.event.eventName,
          eventVersion: params.event.eventVersion,
          status: IntegrationEventStatus.PROCESSING,
          summary: `Worker ${params.consumerName} comenzó a procesar el evento`,
          payload: this.toJson({
            consumerName: params.consumerName,
            jobId: params.jobId,
          }),
          correlationId: params.event.correlationId,
          occurredAt: new Date(),
        },
      });
    });
  }

  async markProcessed(params: {
    event: Pick<OutboxEvent, 'id' | 'tenantId' | 'branchId' | 'eventName' | 'eventVersion' | 'correlationId'>;
    dispatchId?: string | null;
    consumerName: string;
    queueName: string;
    jobId?: string | null;
    result?: unknown;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.outboxEvent.update({
        where: { id: params.event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lockedAt: null,
          processingNode: null,
          lastError: null,
          deadLetterReason: null,
        },
      });

      await tx.integrationEventLog.create({
        data: {
          outboxEventId: params.event.id,
          dispatchId: params.dispatchId ?? null,
          tenantId: params.event.tenantId,
          branchId: params.event.branchId,
          eventName: params.event.eventName,
          eventVersion: params.event.eventVersion,
          status: IntegrationEventStatus.PROCESSED,
          summary: `Evento procesado correctamente por ${params.consumerName}`,
          payload: this.safeJson(params.result),
          correlationId: params.event.correlationId,
          occurredAt: new Date(),
        },
      });

      await tx.consumerCheckpoint.upsert({
        where: {
          consumerName_queueName: {
            consumerName: params.consumerName,
            queueName: params.queueName,
          },
        },
        create: {
          consumerName: params.consumerName,
          queueName: params.queueName,
          lastOutboxEventId: params.event.id,
          lastDispatchId: params.dispatchId ?? null,
          lastJobId: params.jobId ?? null,
          lastCorrelationId: params.event.correlationId,
          lastProcessedAt: new Date(),
        },
        update: {
          lastOutboxEventId: params.event.id,
          lastDispatchId: params.dispatchId ?? null,
          lastJobId: params.jobId ?? null,
          lastCorrelationId: params.event.correlationId,
          lastProcessedAt: new Date(),
        },
      });
    });
  }

  async markDispatchFailed(input: DispatchFailureInput) {
    return this.handleFailure(input, false);
  }

  async markProcessingFailed(input: ProcessingFailureInput) {
    return this.handleFailure(input, true);
  }

  async recordRecoveredStaleProcessing(event: Pick<
    OutboxEvent,
    'id' | 'tenantId' | 'branchId' | 'eventName' | 'eventVersion' | 'correlationId'
  >) {
    return this.prisma.integrationEventLog.create({
      data: {
        outboxEventId: event.id,
        tenantId: event.tenantId,
        branchId: event.branchId,
        eventName: event.eventName,
        eventVersion: event.eventVersion,
        status: IntegrationEventStatus.FAILED,
        summary: 'Se recuperó un evento en PROCESSING que quedó estancado',
        correlationId: event.correlationId,
        occurredAt: new Date(),
      },
    });
  }

  private async handleFailure(input: ProcessingFailureInput, transportWasAcknowledged: boolean) {
    const isDeadLetter = input.event.retryCount >= input.event.maxAttempts;

    return this.prisma.$transaction(async (tx) => {
      await tx.outboxEvent.update({
        where: { id: input.event.id },
        data: {
          status: isDeadLetter ? 'DEAD_LETTER' : 'FAILED',
          lockedAt: null,
          processingNode: null,
          lastError: input.errorMessage,
          nextRetryAt: input.nextRetryAt,
          deadLetterReason: isDeadLetter ? input.errorMessage : null,
        },
      });

      if (!transportWasAcknowledged) {
        await tx.outboxEventDispatch.update({
          where: { id: input.dispatchId },
          data: {
            status: OutboxDispatchStatus.FAILED,
            lastError: input.errorMessage,
          },
        });
      }

      await tx.integrationEventLog.create({
        data: {
          outboxEventId: input.event.id,
          dispatchId: input.dispatchId,
          tenantId: input.event.tenantId,
          branchId: input.event.branchId,
          eventName: input.event.eventName,
          eventVersion: input.event.eventVersion,
          status: isDeadLetter ? IntegrationEventStatus.DEAD_LETTER : IntegrationEventStatus.FAILED,
          summary: isDeadLetter
            ? `Evento movido a dead-letter desde la cola ${input.queueName}`
            : `Evento falló y será reintentado desde la cola ${input.queueName}`,
          payload: this.toJson({
            queueName: input.queueName,
            retryCount: input.event.retryCount,
            maxAttempts: input.event.maxAttempts,
            errorMessage: input.errorMessage,
          }),
          correlationId: input.event.correlationId,
          occurredAt: new Date(),
        },
      });

      if (isDeadLetter) {
        await tx.deadLetterEvent.upsert({
          where: { outboxEventId: input.event.id },
          create: {
            outboxEventId: input.event.id,
            dispatchId: input.dispatchId,
            tenantId: input.event.tenantId,
            branchId: input.event.branchId,
            queueName: input.queueName,
            eventName: input.event.eventName,
            eventVersion: input.event.eventVersion,
            reason: input.errorMessage,
            payload: this.toJson(input.event.payload),
            retryCount: input.event.retryCount,
            firstFailedAt: new Date(),
            lastFailedAt: new Date(),
            correlationId: input.event.correlationId,
          },
          update: {
            dispatchId: input.dispatchId,
            queueName: input.queueName,
            reason: input.errorMessage,
            payload: this.toJson(input.event.payload),
            retryCount: input.event.retryCount,
            lastFailedAt: new Date(),
            correlationId: input.event.correlationId,
          },
        });
      }
    });
  }

  private getClient(client?: PrismaLikeClient) {
    return client ?? this.prisma;
  }

  private safeJson(value: unknown) {
    if (value === undefined) {
      return undefined;
    }

    return this.toJson(value);
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
