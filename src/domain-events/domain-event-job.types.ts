import { DomainEventName } from './domain-event.constants';
import { MessageQueueName } from '../messaging/messaging.constants';

export type DomainEventQueueJobPayload = {
  outboxEventId: string;
  dispatchId: string;
  queueName: MessageQueueName;
  eventName: DomainEventName;
  eventVersion: number;
  tenantId: string;
  branchId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey?: string | null;
  retryCount: number;
};
