import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { DomainEventsController } from './domain-events.controller';

@Module({
  imports: [AutomationModule],
  controllers: [DomainEventsController],
})
export class DomainEventsModule {}
