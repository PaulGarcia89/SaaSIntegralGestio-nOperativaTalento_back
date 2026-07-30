import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Processor, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import IORedis, { Redis, RedisOptions } from 'ioredis';
import { MESSAGE_QUEUE_LIST, MessageQueueName } from './messaging.constants';
import {
  MessageBusPublishRequest,
  MessageBusPublishResult,
  MessageBusSubscribedMessage,
  MessageBusSubscriptionOptions,
  MessageBusWorkerHandle,
  QueueJobRequest,
} from './messaging.types';
import { MessageBusPort } from './message-bus.port';

class BullMqWorkerHandle implements MessageBusWorkerHandle {
  readonly driver = 'bullmq';

  constructor(
    readonly queueName: MessageQueueName,
    private readonly worker: Worker,
  ) {}

  async close() {
    await this.worker.close();
  }
}

@Injectable()
export class QueueManagerService implements OnModuleDestroy, MessageBusPort {
  private readonly logger = new Logger(QueueManagerService.name);
  private readonly queues = new Map<MessageQueueName, Queue>();
  private connection: Redis | null = null;
  private readonly redisEnabled = this.resolveRedisEnabled();

  isEnabled() {
    return this.redisEnabled;
  }

  getDriverName() {
    return 'bullmq';
  }

  async publish<TPayload extends Record<string, unknown>>(
    request: MessageBusPublishRequest<TPayload>,
  ): Promise<MessageBusPublishResult | null> {
    if (!this.redisEnabled) {
      return null;
    }

    const queue = this.getQueue(request.queueName);
    const job = await queue.add(request.jobName, request.payload, request.options);
    return {
      jobId: String(job?.id ?? ''),
      transportMessageId: String(job?.id ?? ''),
    };
  }

  async addJob<TPayload extends Record<string, unknown>>(request: QueueJobRequest<TPayload>) {
    if (!this.redisEnabled) {
      return null;
    }

    const queue = this.getQueue(request.queueName);
    return queue.add(request.jobName, request.payload, request.options);
  }

  subscribe<TPayload extends Record<string, unknown>>(
    queueName: MessageQueueName,
    handler: (message: MessageBusSubscribedMessage<TPayload>) => Promise<unknown>,
    options?: MessageBusSubscriptionOptions,
  ): MessageBusWorkerHandle | null {
    const worker = this.createWorker<TPayload>(
      queueName,
      async (job) =>
        handler({
          id: String(job.id ?? ''),
          payload: job.data,
        }),
      {
        concurrency: options?.concurrency ?? 3,
      },
    );

    if (!worker) {
      return null;
    }

    if (options?.onCompleted) {
      worker.on('completed', (job) => {
        options.onCompleted?.(String(job.id ?? ''));
      });
    }

    if (options?.onFailed) {
      worker.on('failed', (job, error) => {
        options.onFailed?.(String(job?.id ?? ''), error);
      });
    }

    return new BullMqWorkerHandle(queueName, worker);
  }

  createWorker<TPayload = unknown>(
    queueName: MessageQueueName,
    processor: Processor<TPayload>,
    options?: Omit<WorkerOptions, 'connection'>,
  ) {
    if (!this.redisEnabled) {
      return null;
    }

    const worker = new Worker(queueName, processor, {
      connection: this.getConnectionOptions(),
      concurrency: 3,
      ...options,
    });

    return worker;
  }

  async onModuleDestroy() {
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));

    if (this.connection) {
      await this.connection.quit();
      this.connection = null;
    }
  }

  private getQueue(queueName: MessageQueueName) {
    const existing = this.queues.get(queueName);
    if (existing) {
      return existing;
    }

    const queue = new Queue(queueName, this.buildQueueOptions());
    this.queues.set(queueName, queue);
    return queue;
  }

  private buildQueueOptions(): QueueOptions {
    return {
      connection: this.getConnectionOptions(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 250,
      },
    };
  }

  private getConnectionOptions(): Redis | RedisOptions {
    if (!this.connection) {
      const redisUrl = process.env.REDIS_URL?.trim();

      if (redisUrl) {
        this.connection = new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });
      } else {
        this.connection = new IORedis({
          host: process.env.REDIS_HOST ?? '127.0.0.1',
          port: Number(process.env.REDIS_PORT ?? '6379'),
          db: Number(process.env.REDIS_DB ?? '0'),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });
      }

      this.connection.on('error', (error) => {
        this.logger.warn(`Redis connection error: ${error.message}`);
      });
    }

    return this.connection;
  }

  private resolveRedisEnabled() {
    const explicit = process.env.MESSAGING_ENABLED?.trim().toLowerCase();
    if (explicit === 'false') {
      this.logger.warn('Messaging disabled by MESSAGING_ENABLED=false');
      return false;
    }

    if (process.env.REDIS_URL?.trim()) {
      return true;
    }

    const hasHost = Boolean(process.env.REDIS_HOST?.trim());
    const hasPort = Boolean(process.env.REDIS_PORT?.trim());

    if (hasHost || hasPort) {
      return true;
    }

    this.logger.warn(
      'Messaging queue layer is disabled because REDIS_URL or REDIS_HOST/REDIS_PORT are not configured',
    );
    return false;
  }
}
