import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MESSAGE_QUEUE_LIST } from '../messaging/messaging.constants';
import { MessageBusPort } from '../messaging/message-bus.port';
import { MESSAGE_BUS } from '../messaging/message-bus.tokens';
import { MessageBusWorkerHandle } from '../messaging/messaging.types';
import { DomainEventQueueJobPayload } from './domain-event-job.types';
import { DomainEventExecutionService } from './domain-event-execution.service';

@Injectable()
export class DomainEventWorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventWorkersService.name);
  private readonly workers: MessageBusWorkerHandle[] = [];

  constructor(
    @Inject(MESSAGE_BUS) private readonly messageBus: MessageBusPort,
    private readonly executionService: DomainEventExecutionService,
  ) {}

  onModuleInit() {
    if (!this.messageBus.isEnabled()) {
      this.logger.warn('Message bus workers are disabled because no active driver is configured');
      return;
    }

    for (const queueName of MESSAGE_QUEUE_LIST) {
      const worker = this.messageBus.subscribe<DomainEventQueueJobPayload>(
        queueName,
        async (message) => {
          return this.executionService.processQueuedJob(message.payload, message.id ?? '');
        },
        {
          concurrency: this.resolveConcurrency(queueName),
          onCompleted: (messageId) => {
            this.logger.debug(
              `Queue ${queueName} on ${this.messageBus.getDriverName()} completed job ${messageId}`,
            );
          },
          onFailed: (messageId, error) => {
            this.logger.warn(
              `Queue ${queueName} on ${this.messageBus.getDriverName()} failed job ${messageId ?? 'unknown'}: ${error.message}`,
            );
          },
        },
      );

      if (!worker) {
        continue;
      }

      this.workers.push(worker);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private resolveConcurrency(queueName: string) {
    const normalized = queueName.toUpperCase().replace(/-/g, '_');
    return Number(process.env[`QUEUE_CONCURRENCY_${normalized}`] ?? '3');
  }
}
