import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  DOMAIN_EVENT_CATALOG,
  DomainEventEnvelope,
  DomainEventName,
  PersistedDomainEventPayload,
  UnsignedDomainEventPayload,
} from './domain-event.constants';
import { DomainEventSecurityService } from './domain-event-security.service';
import { IntegrationEventTrackingService } from './integration-event-tracking.service';

type PublishDomainEventInput = {
  envelope: DomainEventEnvelope<UnsignedDomainEventPayload>;
  userId?: string | null;
  aggregateId?: string | null;
  nextRetryAt?: Date;
  maxAttempts?: number;
};

@Injectable()
export class DomainEventOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingService: IntegrationEventTrackingService,
    private readonly securityService: DomainEventSecurityService,
  ) {}

  async publish(input: PublishDomainEventInput) {
    const catalogEntry = DOMAIN_EVENT_CATALOG[input.envelope.eventName as DomainEventName];
    const signedPayload: PersistedDomainEventPayload = {
      ...input.envelope.payload,
      meta: this.securityService.signEnvelope(input.envelope),
    };

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.create({
        data: {
          tenantId: input.envelope.tenantId,
          branchId: input.envelope.branchId ?? null,
          userId: input.userId ?? null,
          aggregateType: catalogEntry.aggregateType,
          aggregateId: input.aggregateId ?? null,
          eventName: input.envelope.eventName,
          eventVersion: input.envelope.eventVersion,
          payload: this.toJson(signedPayload),
          occurredAt: input.envelope.occurredAt,
          correlationId: input.envelope.correlationId,
          causationId: input.envelope.causationId ?? null,
          idempotencyKey: input.envelope.idempotencyKey,
          nextRetryAt: input.nextRetryAt ?? input.envelope.occurredAt,
          maxAttempts: input.maxAttempts ?? 10,
        },
      });

      await this.trackingService.recordPublished(event, tx);

      return event;
    });
  }

  private toJson(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
