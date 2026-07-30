import { Module } from '@nestjs/common';
import { DomainEventsController } from './domain-events.controller';
import { DomainEventsService } from './domain-events.service';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueWorkersModule } from '../queue-workers/queue-workers.module';

@Module({
  imports: [OutboxModule, QueueWorkersModule],
  controllers: [DomainEventsController],
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
