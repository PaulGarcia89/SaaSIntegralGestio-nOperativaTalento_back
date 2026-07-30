import { Global, Module } from '@nestjs/common';
import { MESSAGE_BUS } from './message-bus.tokens';
import { QueueManagerService } from './queue-manager.service';
import { RabbitMqMessageBusService } from './rabbitmq-message-bus.service';

@Global()
@Module({
  providers: [
    QueueManagerService,
    RabbitMqMessageBusService,
    {
      provide: MESSAGE_BUS,
      useFactory: (
        bullMqService: QueueManagerService,
        rabbitMqService: RabbitMqMessageBusService,
      ) => {
        const driver = (process.env.MESSAGE_BUS_DRIVER ?? 'bullmq').trim().toLowerCase();
        return driver === 'rabbitmq' ? rabbitMqService : bullMqService;
      },
      inject: [QueueManagerService, RabbitMqMessageBusService],
    },
  ],
  exports: [QueueManagerService, RabbitMqMessageBusService, MESSAGE_BUS],
})
export class MessagingModule {}
