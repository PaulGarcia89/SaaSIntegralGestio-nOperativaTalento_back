import { JobsOptions } from 'bullmq';
import { MessageQueueName } from './messaging.constants';

export type MessageBusPublishRequest<TPayload extends Record<string, unknown>> = {
  queueName: MessageQueueName;
  jobName: string;
  payload: TPayload;
  options?: JobsOptions;
};

export type QueueJobRequest<TPayload extends Record<string, unknown>> =
  MessageBusPublishRequest<TPayload>;

export type MessageBusPublishResult = {
  jobId: string | null;
  transportMessageId?: string | null;
};

export type MessageBusSubscribedMessage<TPayload extends Record<string, unknown>> = {
  id: string | null;
  payload: TPayload;
};

export type MessageBusSubscriptionOptions = {
  concurrency?: number;
  onCompleted?: (messageId: string | null) => void;
  onFailed?: (messageId: string | null, error: Error) => void;
};

export interface MessageBusWorkerHandle {
  readonly driver: string;
  readonly queueName: MessageQueueName;
  close(): Promise<void>;
}
