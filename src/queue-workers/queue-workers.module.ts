import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { DomainEventExecutionService } from '../domain-events/domain-event-execution.service';
import { DomainEventWorkersService } from '../domain-events/domain-event-workers.service';
import { EventHandlerRegistryService } from '../domain-events/event-handler-registry.service';
import { OutboxDispatcherService } from '../domain-events/outbox-dispatcher.service';
import { MessagingModule } from '../messaging/messaging.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [AutomationModule, MessagingModule, OutboxModule],
  providers: [
    OutboxDispatcherService,
    DomainEventExecutionService,
    EventHandlerRegistryService,
    DomainEventWorkersService,
  ],
  exports: [
    OutboxDispatcherService,
    DomainEventExecutionService,
    EventHandlerRegistryService,
    DomainEventWorkersService,
  ],
})
export class QueueWorkersModule {}
