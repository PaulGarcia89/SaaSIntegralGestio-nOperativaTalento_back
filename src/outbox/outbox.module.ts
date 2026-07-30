import { Module } from '@nestjs/common';
import { DomainEventOutboxService } from '../domain-events/domain-event-outbox.service';
import { DomainEventRoutingService } from '../domain-events/domain-event-routing.service';
import { DomainEventSecurityService } from '../domain-events/domain-event-security.service';
import { IntegrationEventTrackingService } from '../domain-events/integration-event-tracking.service';

@Module({
  providers: [
    DomainEventSecurityService,
    DomainEventRoutingService,
    IntegrationEventTrackingService,
    DomainEventOutboxService,
  ],
  exports: [
    DomainEventSecurityService,
    DomainEventRoutingService,
    IntegrationEventTrackingService,
    DomainEventOutboxService,
  ],
})
export class OutboxModule {}
