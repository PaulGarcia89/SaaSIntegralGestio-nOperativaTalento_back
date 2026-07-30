import { Injectable, Logger } from '@nestjs/common';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  DOMAIN_EVENT_NAMES,
  DomainEventDto,
  DomainEventName,
} from './domain-event.constants';
import { CandidateHiredDto } from './dto/candidate-hired.dto';
import { SimpleDomainEventDto } from './dto/simple-domain-event.dto';
import { AutomationService } from '../automation/automation.service';
import { NotificationsService } from '../notifications/notifications.service';

type DomainEventHandler = (actor: JwtPayload, dto: DomainEventDto) => Promise<unknown>;

@Injectable()
export class EventHandlerRegistryService {
  private readonly logger = new Logger(EventHandlerRegistryService.name);
  private readonly handlers: Record<DomainEventName, DomainEventHandler>;

  constructor(
    private readonly automationService: AutomationService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.handlers = {
      [DOMAIN_EVENT_NAMES.CANDIDATE_HIRED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.CANDIDATE_HIRED, dto, () =>
          this.automationService.processCandidateHired(actor, dto as CandidateHiredDto)),
      [DOMAIN_EVENT_NAMES.EMPLOYEE_BRANCH_CHANGED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.EMPLOYEE_BRANCH_CHANGED, dto, () =>
          this.automationService.processBranchChanged(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.EMPLOYEE_OFFBOARDING_STARTED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.EMPLOYEE_OFFBOARDING_STARTED, dto, () =>
          this.automationService.processOffboardingStarted(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.ONBOARDING_COMPLETED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.ONBOARDING_COMPLETED, dto, () =>
          this.automationService.processOnboardingCompleted(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.INVENTORY_ASSET_ASSIGNED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.INVENTORY_ASSET_ASSIGNED, dto, () =>
          this.automationService.processAssetAssigned(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.TRAINING_COMPLETED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.TRAINING_COMPLETED, dto, () =>
          this.automationService.processTrainingCompleted(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.OPERATION_HANDOFF_COMPLETED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.OPERATION_HANDOFF_COMPLETED, dto, () =>
          this.automationService.processOperationHandoffCompleted(actor, dto as SimpleDomainEventDto)),
      [DOMAIN_EVENT_NAMES.COMPLIANCE_CLOSED]: (actor, dto) =>
        this.processWithNotification(actor, DOMAIN_EVENT_NAMES.COMPLIANCE_CLOSED, dto, () =>
          this.automationService.processComplianceClosed(actor, dto as SimpleDomainEventDto)),
    };
  }

  private async processWithNotification(
    actor: JwtPayload,
    eventName: DomainEventName,
    dto: DomainEventDto,
    handler: () => Promise<unknown>,
  ) {
    const result = await handler();
    await this.notificationsService.createFromDomainEvent(actor, eventName, dto);
    return result;
  }

  resolve(eventName: DomainEventName) {
    const handler = this.handlers[eventName];

    if (!handler) {
      this.logger.warn(`No existe handler registrado para ${eventName}`);
      return null;
    }

    return handler;
  }
}
