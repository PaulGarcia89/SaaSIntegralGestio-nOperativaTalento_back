import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CandidateHiredDto } from './dto/candidate-hired.dto';
import { DomainEventBaseDto } from './dto/domain-event-base.dto';
import { SimpleDomainEventDto } from './dto/simple-domain-event.dto';
import { AtsAutomationEventDto } from './dto/ats-automation-event.dto';
import {
  DOMAIN_EVENT_CATALOG,
  DOMAIN_EVENT_NAMES,
  DomainEventActorSnapshot,
  DomainEventDto,
  DomainEventEnvelope,
  DomainEventName,
} from './domain-event.constants';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

type DomainEventRequestContext = {
  correlationId?: string | null;
  idempotencyKey?: string;
};

@Injectable()
export class DomainEventsService {
  constructor(
    private readonly outboxService: DomainEventOutboxService,
    private readonly dispatcherService: OutboxDispatcherService,
  ) {}

  candidateHired(actor: JwtPayload, dto: CandidateHiredDto, context?: DomainEventRequestContext) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.CANDIDATE_HIRED,
      dto,
      {
        aggregateId: dto.candidateId,
      },
      context,
    );
  }

  applicationStageChanged(actor: JwtPayload, dto: AtsAutomationEventDto, context?: DomainEventRequestContext) {
    return this.publishAts(actor, DOMAIN_EVENT_NAMES.APPLICATION_STAGE_CHANGED, dto, context);
  }

  applicationRejected(actor: JwtPayload, dto: AtsAutomationEventDto, context?: DomainEventRequestContext) {
    return this.publishAts(actor, DOMAIN_EVENT_NAMES.APPLICATION_REJECTED, dto, context);
  }

  interviewScheduled(actor: JwtPayload, dto: AtsAutomationEventDto, context?: DomainEventRequestContext) {
    return this.publishAts(actor, DOMAIN_EVENT_NAMES.INTERVIEW_SCHEDULED, dto, context);
  }

  interviewCompleted(actor: JwtPayload, dto: AtsAutomationEventDto, context?: DomainEventRequestContext) {
    return this.publishAts(actor, DOMAIN_EVENT_NAMES.INTERVIEW_COMPLETED, dto, context);
  }

  branchChanged(actor: JwtPayload, dto: SimpleDomainEventDto, context?: DomainEventRequestContext) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.EMPLOYEE_BRANCH_CHANGED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  offboardingStarted(
    actor: JwtPayload,
    dto: SimpleDomainEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.EMPLOYEE_OFFBOARDING_STARTED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  onboardingCompleted(
    actor: JwtPayload,
    dto: SimpleDomainEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.ONBOARDING_COMPLETED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  assetAssigned(actor: JwtPayload, dto: SimpleDomainEventDto, context?: DomainEventRequestContext) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.INVENTORY_ASSET_ASSIGNED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  trainingCompleted(
    actor: JwtPayload,
    dto: SimpleDomainEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.TRAINING_COMPLETED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  operationHandoffCompleted(
    actor: JwtPayload,
    dto: SimpleDomainEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.OPERATION_HANDOFF_COMPLETED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  complianceClosed(
    actor: JwtPayload,
    dto: SimpleDomainEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(
      actor,
      DOMAIN_EVENT_NAMES.COMPLIANCE_CLOSED,
      dto,
      {
        aggregateId: dto.employeeId,
      },
      context,
    );
  }

  private publishAndProcess(
    actor: JwtPayload,
    eventName: DomainEventName,
    dto: DomainEventBaseDto,
    aggregate: { aggregateId?: string | null },
    context?: DomainEventRequestContext,
  ) {
    const occurredAt = dto.occurredAt ?? new Date();
    const correlationId = context?.correlationId ?? randomUUID();
    const envelope: DomainEventEnvelope<{
      dto: DomainEventDto;
      actor: DomainEventActorSnapshot;
    }> = {
      eventName,
      eventVersion: DOMAIN_EVENT_CATALOG[eventName].version,
      occurredAt,
      tenantId: actor.activeTenantId ?? actor.tenantId,
      branchId: dto.branchId ?? actor.activeBranchId ?? null,
      correlationId,
      causationId: null,
      idempotencyKey: context?.idempotencyKey ?? this.buildIdempotencyKey(eventName, dto, occurredAt),
      payload: {
        dto: dto as DomainEventDto,
        actor: this.toActorSnapshot(actor),
      },
    };

    return this.outboxService
      .publish({
        envelope,
        userId: actor.sub,
        aggregateId:
          aggregate.aggregateId ??
          dto.workflowId ??
          dto.employeeId ??
          dto.candidateId ??
          null,
      })
      .then((event) => this.dispatcherService.dispatchEventById(event.id));
  }

  private publishAts(
    actor: JwtPayload,
    eventName: Extract<DomainEventName, 'ats.application_stage_changed' | 'ats.application_rejected' | 'ats.interview_scheduled' | 'ats.interview_completed'>,
    dto: AtsAutomationEventDto,
    context?: DomainEventRequestContext,
  ) {
    return this.publishAndProcess(actor, eventName, dto, { aggregateId: dto.interviewId ?? dto.applicationId }, context);
  }

  private buildIdempotencyKey(
    eventName: DomainEventName,
    dto: DomainEventBaseDto,
    occurredAt: Date,
  ) {
    return [
      eventName,
      dto.workflowId ?? 'no-workflow',
      dto.employeeId ?? 'no-employee',
      dto.candidateId ?? 'no-candidate',
      occurredAt.toISOString(),
    ].join(':');
  }

  private toActorSnapshot(actor: JwtPayload): DomainEventActorSnapshot {
    return {
      sub: actor.sub,
      userId: actor.userId,
      tenantId: actor.tenantId,
      allowedTenantIds: actor.allowedTenantIds,
      activeTenantId: actor.activeTenantId,
      tenantSlug: actor.tenantSlug,
      tenantName: actor.tenantName,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
      role: actor.role,
      scope: actor.scope,
      isSuperAdmin: actor.isSuperAdmin,
      roleScope: actor.roleScope,
      allowedBranchIds: actor.allowedBranchIds,
      activeBranchId: actor.activeBranchId,
      roles: actor.roles,
      permissions: actor.permissions,
      enabledModules: actor.enabledModules,
      isGlobalContext: actor.isGlobalContext,
      impersonation: actor.impersonation,
      subscriptionStatus: actor.subscriptionStatus,
      subscriptionGraceEndsAt: actor.subscriptionGraceEndsAt,
    };
  }
}
