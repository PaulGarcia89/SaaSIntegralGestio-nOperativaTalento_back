import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MessageQueueName } from './messaging.constants';
import { MessageBusPort } from './message-bus.port';
import {
  MessageBusPublishRequest,
  MessageBusPublishResult,
  MessageBusSubscribedMessage,
  MessageBusSubscriptionOptions,
  MessageBusWorkerHandle,
} from './messaging.types';

type AmqpConnection = {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type AmqpChannel = {
  assertExchange(name: string, type: string, options?: Record<string, unknown>): Promise<unknown>;
  assertQueue(
    name: string,
    options?: Record<string, unknown>,
  ): Promise<{ queue: string; messageCount: number; consumerCount: number }>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean;
  consume(
    queue: string,
    onMessage: (message: AmqpMessage | null) => void | Promise<void>,
    options?: Record<string, unknown>,
  ): Promise<{ consumerTag: string }>;
  ack(message: AmqpMessage): void;
  nack(message: AmqpMessage, allUpTo?: boolean, requeue?: boolean): void;
  cancel(consumerTag: string): Promise<void>;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type AmqpMessage = {
  content: Buffer;
  properties: {
    messageId?: string;
    timestamp?: number;
    headers?: Record<string, unknown>;
    type?: string;
    contentType?: string;
    contentEncoding?: string;
    correlationId?: string;
    deliveryMode?: number;
  };
  fields: {
    routingKey: string;
    exchange: string;
    deliveryTag: number;
  };
};

class RabbitMqWorkerHandle implements MessageBusWorkerHandle {
  readonly driver = 'rabbitmq';

  constructor(
    readonly queueName: MessageQueueName,
    private readonly channel: AmqpChannel,
    private readonly consumerTag: string,
  ) {}

  async close() {
    await this.channel.cancel(this.consumerTag);
    await this.channel.close();
  }
}

@Injectable()
export class RabbitMqMessageBusService implements MessageBusPort, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqMessageBusService.name);
  private readonly enabled = this.resolveRabbitEnabled();
  private readonly mainExchange = process.env.RABBITMQ_MAIN_EXCHANGE?.trim() || 'domain.events';
  private readonly retryExchange =
    process.env.RABBITMQ_RETRY_EXCHANGE?.trim() || 'domain.events.retry';
  private readonly deadLetterExchange =
    process.env.RABBITMQ_DLX_EXCHANGE?.trim() || 'domain.events.dlx';
  private readonly retryDelayMs = Number(process.env.RABBITMQ_RETRY_DELAY_MS ?? '15000');
  private readonly retryBackoffMs = Number(process.env.RABBITMQ_RETRY_BACKOFF_MS ?? '5000');
  private readonly maxRetries = Number(process.env.RABBITMQ_MAX_RETRIES ?? '3');

  private connection: AmqpConnection | null = null;
  private publishChannel: AmqpChannel | null = null;
  private readonly initializedQueues = new Set<MessageQueueName>();
  private amqpModulePromise: Promise<{ connect: (url: string) => Promise<AmqpConnection> }> | null = null;

  isEnabled() {
    return this.enabled;
  }

  getDriverName() {
    return 'rabbitmq';
  }

  async publish<TPayload extends Record<string, unknown>>(
    request: MessageBusPublishRequest<TPayload>,
  ): Promise<MessageBusPublishResult | null> {
    if (!this.enabled) {
      return null;
    }

    const channel = await this.getPublishChannel();
    await this.ensureQueueTopology(channel, request.queueName);

    const messageId =
      String(request.options?.jobId ?? '') ||
      `rabbit-${request.queueName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const content = Buffer.from(JSON.stringify(request.payload), 'utf8');
    const published = channel.publish(this.mainExchange, request.queueName, content, {
      persistent: true,
      messageId,
      correlationId: this.resolveCorrelationId(request.payload),
      timestamp: Date.now(),
      type: request.jobName,
      contentType: 'application/json',
      headers: {
        'x-queue-name': request.queueName,
        'x-job-name': request.jobName,
        'x-max-retries': this.maxRetries,
        'x-retry-count': 0,
      },
    });

    if (!published) {
      throw new Error(`RabbitMQ publish backpressure for queue ${request.queueName}`);
    }

    return {
      jobId: messageId,
      transportMessageId: messageId,
    };
  }

  subscribe<TPayload extends Record<string, unknown>>(
    queueName: MessageQueueName,
    handler: (message: MessageBusSubscribedMessage<TPayload>) => Promise<unknown>,
    options?: MessageBusSubscriptionOptions,
  ): MessageBusWorkerHandle | null {
    if (!this.enabled) {
      return null;
    }

    const handlePromise = this.createSubscription(queueName, handler, options);
    return {
      driver: 'rabbitmq',
      queueName,
      close: async () => {
        const handle = await handlePromise;
        await handle.close();
      },
    };
  }

  async onModuleDestroy() {
    if (this.publishChannel) {
      await this.publishChannel.close().catch(() => undefined);
      this.publishChannel = null;
    }

    if (this.connection) {
      await this.connection.close().catch(() => undefined);
      this.connection = null;
    }
  }

  private async createSubscription<TPayload extends Record<string, unknown>>(
    queueName: MessageQueueName,
    handler: (message: MessageBusSubscribedMessage<TPayload>) => Promise<unknown>,
    options?: MessageBusSubscriptionOptions,
  ) {
    const connection = await this.getConnection();
    const channel = await connection.createChannel();

    channel.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RabbitMQ consumer channel error on ${queueName}: ${message}`);
    });

    await this.ensureQueueTopology(channel, queueName);
    await channel.prefetch(Math.max(1, options?.concurrency ?? 1));

    const consumer = await channel.consume(queueName, async (message) => {
      if (!message) {
        return;
      }

      try {
        const parsed = JSON.parse(message.content.toString('utf8')) as TPayload;
        await handler({
          id: message.properties.messageId ?? null,
          payload: parsed,
        });

        channel.ack(message);
        options?.onCompleted?.(message.properties.messageId ?? null);
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        try {
          await this.handleProcessingFailure(channel, queueName, message, normalizedError);
          options?.onFailed?.(message.properties.messageId ?? null, normalizedError);
        } catch (republishError) {
          const brokerError =
            republishError instanceof Error ? republishError : new Error(String(republishError));
          this.logger.error(
            JSON.stringify({
              message: 'RabbitMQ retry/DLQ handling failed; requeueing original message',
              queueName,
              messageId: message.properties.messageId ?? null,
              error: brokerError.message,
            }),
          );
          channel.nack(message, false, true);
          options?.onFailed?.(message.properties.messageId ?? null, brokerError);
        }
      }
    });

    this.logger.log(
      JSON.stringify({
        message: 'RabbitMQ consumer registered',
        queueName,
        consumerTag: consumer.consumerTag,
        concurrency: Math.max(1, options?.concurrency ?? 1),
      }),
    );

    return new RabbitMqWorkerHandle(queueName, channel, consumer.consumerTag);
  }

  private async handleProcessingFailure(
    channel: AmqpChannel,
    queueName: MessageQueueName,
    message: AmqpMessage,
    error: Error,
  ) {
    const currentRetry = this.readRetryCount(message);

    if (currentRetry < this.maxRetries) {
      const nextRetry = currentRetry + 1;
      const delayMs = this.retryDelayMs + this.retryBackoffMs * Math.max(0, nextRetry - 1);
      const republished = channel.publish(
        this.retryExchange,
        queueName,
        message.content,
        {
          persistent: true,
          messageId: message.properties.messageId,
          correlationId: message.properties.correlationId,
          timestamp: Date.now(),
          type: message.properties.type,
          contentType: message.properties.contentType ?? 'application/json',
          expiration: String(delayMs),
          headers: {
            ...(message.properties.headers ?? {}),
            'x-retry-count': nextRetry,
            'x-last-error': error.message,
            'x-original-exchange': message.fields.exchange,
            'x-original-routing-key': message.fields.routingKey,
          },
        },
      );

      if (!republished) {
        throw new Error(`RabbitMQ retry publish backpressure for queue ${queueName}`);
      }

      this.logger.warn(
        JSON.stringify({
          message: 'RabbitMQ message scheduled for retry',
          queueName,
          messageId: message.properties.messageId ?? null,
          retryCount: nextRetry,
          delayMs,
          error: error.message,
        }),
      );

      channel.ack(message);
      return;
    }

    const sentToDlq = channel.publish(this.deadLetterExchange, queueName, message.content, {
      persistent: true,
      messageId: message.properties.messageId,
      correlationId: message.properties.correlationId,
      timestamp: Date.now(),
      type: message.properties.type,
      contentType: message.properties.contentType ?? 'application/json',
      headers: {
        ...(message.properties.headers ?? {}),
        'x-retry-count': currentRetry,
        'x-dead-letter-reason': error.message,
        'x-final-failed-at': new Date().toISOString(),
      },
    });

    if (!sentToDlq) {
      throw new Error(`RabbitMQ dead-letter publish backpressure for queue ${queueName}`);
    }

    this.logger.error(
      JSON.stringify({
        message: 'RabbitMQ message moved to DLQ',
        queueName,
        messageId: message.properties.messageId ?? null,
        retryCount: currentRetry,
        error: error.message,
      }),
    );

    channel.ack(message);
  }

  private async ensureQueueTopology(channel: AmqpChannel, queueName: MessageQueueName) {
    if (this.initializedQueues.has(queueName)) {
      return;
    }

    await channel.assertExchange(this.mainExchange, 'direct', { durable: true });
    await channel.assertExchange(this.retryExchange, 'direct', { durable: true });
    await channel.assertExchange(this.deadLetterExchange, 'direct', { durable: true });

    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, this.mainExchange, queueName);

    await channel.assertQueue(`${queueName}.retry`, {
      durable: true,
      deadLetterExchange: this.mainExchange,
      deadLetterRoutingKey: queueName,
    });
    await channel.bindQueue(`${queueName}.retry`, this.retryExchange, queueName);

    await channel.assertQueue(`${queueName}.dlq`, { durable: true });
    await channel.bindQueue(`${queueName}.dlq`, this.deadLetterExchange, queueName);

    this.initializedQueues.add(queueName);
  }

  private resolveCorrelationId(payload: Record<string, unknown>) {
    const candidate = payload['correlationId'];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
  }

  private readRetryCount(message: AmqpMessage) {
    const raw = message.properties.headers?.['x-retry-count'];
    const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  private async getPublishChannel() {
    if (this.publishChannel) {
      return this.publishChannel;
    }

    const connection = await this.getConnection();
    const channel = await connection.createChannel();
    channel.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RabbitMQ publish channel error: ${message}`);
    });
    this.publishChannel = channel;
    return channel;
  }

  private async getConnection() {
    if (this.connection) {
      return this.connection;
    }

    const amqp = await this.loadAmqp();
    this.connection = await amqp.connect(this.resolveConnectionUrl());
    this.connection.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RabbitMQ connection error: ${message}`);
    });
    return this.connection;
  }

  private async loadAmqp() {
    if (!this.amqpModulePromise) {
      const dynamicImport = new Function(
        'modulePath',
        'return import(modulePath)',
      ) as (modulePath: string) => Promise<{ connect: (url: string) => Promise<AmqpConnection> }>;
      this.amqpModulePromise = dynamicImport('amqplib');
    }

    return this.amqpModulePromise;
  }

  private resolveConnectionUrl() {
    const explicitUrl = process.env.RABBITMQ_URL?.trim();
    if (explicitUrl) {
      return explicitUrl;
    }

    const protocol = process.env.RABBITMQ_PROTOCOL?.trim() || 'amqp';
    const username = encodeURIComponent(process.env.RABBITMQ_USERNAME?.trim() || 'guest');
    const password = encodeURIComponent(process.env.RABBITMQ_PASSWORD?.trim() || 'guest');
    const host = process.env.RABBITMQ_HOST?.trim() || '127.0.0.1';
    const port = process.env.RABBITMQ_PORT?.trim() || '5672';
    const vhost = process.env.RABBITMQ_VHOST?.trim() || '/';
    const normalizedVhost = vhost.startsWith('/') ? vhost : `/${vhost}`;

    return `${protocol}://${username}:${password}@${host}:${port}${normalizedVhost}`;
  }

  private resolveRabbitEnabled() {
    const driver = (process.env.MESSAGE_BUS_DRIVER ?? 'bullmq').trim().toLowerCase();
    if (driver !== 'rabbitmq') {
      return false;
    }

    const hasUrl = Boolean(process.env.RABBITMQ_URL?.trim());
    const hasHost = Boolean(process.env.RABBITMQ_HOST?.trim());

    if (!hasUrl && !hasHost) {
      this.logger.warn(
        'MESSAGE_BUS_DRIVER=rabbitmq but no RABBITMQ_URL or RABBITMQ_HOST is configured; the RabbitMQ adapter will stay disabled',
      );
      return false;
    }

    this.logger.log('RabbitMQ adapter enabled as active message bus driver');
    return true;
  }
}
