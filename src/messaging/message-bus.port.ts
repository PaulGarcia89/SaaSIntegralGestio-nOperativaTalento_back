import { MessageBusPublishRequest, MessageBusPublishResult, MessageBusSubscribedMessage, MessageBusSubscriptionOptions, MessageBusWorkerHandle } from './messaging.types';
import { MessageQueueName } from './messaging.constants';

export interface MessageBusPort {
  isEnabled(): boolean;
  getDriverName(): string;
  publish<TPayload extends Record<string, unknown>>(
    request: MessageBusPublishRequest<TPayload>,
  ): Promise<MessageBusPublishResult | null>;
  subscribe<TPayload extends Record<string, unknown>>(
    queueName: MessageQueueName,
    handler: (message: MessageBusSubscribedMessage<TPayload>) => Promise<unknown>,
    options?: MessageBusSubscriptionOptions,
  ): MessageBusWorkerHandle | null;
}
