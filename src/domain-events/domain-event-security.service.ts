import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { createHmac } from 'crypto';
import { OutboxEvent } from '@prisma/client';
import { SubscriptionAccessState } from '../common/auth/subscription-access-state.enum';
import { AccessScope } from '../common/enums/access-scope.enum';
import { RoleScope } from '../common/enums/role-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  DOMAIN_EVENT_CATALOG,
  DomainEventActorSnapshot,
  DomainEventDto,
  DomainEventEnvelope,
  DomainEventName,
  DomainEventPayloadMetadata,
  PersistedDomainEventPayload,
} from './domain-event.constants';
import { DomainEventQueueJobPayload } from './domain-event-job.types';

type SignableEnvelope = DomainEventEnvelope<{
  actor: DomainEventActorSnapshot;
  dto: DomainEventDto;
}>;

type PersistedEventRecord = Pick<
  OutboxEvent,
  | 'id'
  | 'tenantId'
  | 'branchId'
  | 'eventName'
  | 'eventVersion'
  | 'occurredAt'
  | 'correlationId'
  | 'causationId'
  | 'idempotencyKey'
>;

@Injectable()
export class DomainEventSecurityService {
  private readonly signingSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.signingSecret =
      this.configService.get<string>('DOMAIN_EVENT_SIGNING_SECRET')?.trim() ||
      this.configService.get<string>('JWT_ACCESS_SECRET')?.trim() ||
      'development-domain-event-signing-secret';
  }

  signEnvelope(envelope: SignableEnvelope): DomainEventPayloadMetadata {
    return {
      producer: 'backend',
      signatureAlgorithm: 'hmac-sha256',
      signature: this.computeSignature(envelope),
      signedAt: new Date().toISOString(),
    };
  }

  validateQueuedJob(job: DomainEventQueueJobPayload, event: PersistedEventRecord) {
    if (job.outboxEventId !== event.id) {
      throw new BadRequestException('Job outboxEventId mismatch');
    }

    if (job.tenantId !== event.tenantId) {
      throw new ForbiddenException('Job tenantId mismatch');
    }

    if ((job.branchId ?? null) !== (event.branchId ?? null)) {
      throw new ForbiddenException('Job branchId mismatch');
    }

    if (job.eventName !== event.eventName) {
      throw new BadRequestException('Job eventName mismatch');
    }

    if (job.eventVersion !== event.eventVersion) {
      throw new BadRequestException('Job eventVersion mismatch');
    }

    if ((job.correlationId ?? null) !== (event.correlationId ?? null)) {
      throw new BadRequestException('Job correlationId mismatch');
    }
  }

  parseAndValidatePayload(
    event: PersistedEventRecord,
    rawPayload: unknown,
  ): PersistedDomainEventPayload {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      throw new BadRequestException('Invalid outbox payload');
    }

    const payload = rawPayload as PersistedDomainEventPayload;

    if (!payload.actor || !payload.dto || !payload.meta) {
      throw new BadRequestException('Invalid outbox payload shape');
    }

    this.assertMetadata(payload.meta);
    this.assertSignature(event, payload);
    this.assertCatalogCompatibility(event);
    this.assertContextConsistency(event, payload);
    this.validateDto(event.eventName as DomainEventName, payload.dto);

    return payload;
  }

  buildExecutionActor(
    event: PersistedEventRecord,
    actorSnapshot: DomainEventActorSnapshot,
  ): JwtPayload {
    const branchId = event.branchId ?? null;
    const normalizedBranchIds = branchId
      ? [branchId]
      : actorSnapshot.allowedBranchIds.filter(Boolean);

    return {
      ...actorSnapshot,
      tenantId: event.tenantId,
      allowedTenantIds: [event.tenantId],
      activeTenantId: event.tenantId,
      scope: branchId ? AccessScope.BRANCH : AccessScope.TENANT,
      isSuperAdmin: false,
      roleScope:
        actorSnapshot.roleScope === RoleScope.TENANT_ADMIN ? RoleScope.TENANT_ADMIN : RoleScope.BRANCH_USER,
      allowedBranchIds: normalizedBranchIds,
      activeBranchId: branchId,
      isGlobalContext: false,
      impersonation: {
        active: false,
        tenantId: null,
        startedAt: null,
        reason: null,
      },
      subscriptionStatus: actorSnapshot.subscriptionStatus ?? SubscriptionAccessState.ACTIVE,
      subscriptionGraceEndsAt: actorSnapshot.subscriptionGraceEndsAt ?? null,
    };
  }

  private assertMetadata(meta: DomainEventPayloadMetadata) {
    if (meta.producer !== 'backend') {
      throw new ForbiddenException('Untrusted domain event producer');
    }

    if (meta.signatureAlgorithm !== 'hmac-sha256') {
      throw new BadRequestException('Unsupported domain event signature algorithm');
    }

    if (!meta.signature?.trim()) {
      throw new BadRequestException('Missing domain event signature');
    }
  }

  private assertSignature(event: PersistedEventRecord, payload: PersistedDomainEventPayload) {
    const expected = this.computeSignature({
      eventName: event.eventName as DomainEventName,
      eventVersion: event.eventVersion,
      occurredAt: event.occurredAt,
      tenantId: event.tenantId,
      branchId: event.branchId,
      correlationId: event.correlationId ?? '',
      causationId: event.causationId ?? null,
      idempotencyKey: event.idempotencyKey ?? '',
      payload: {
        actor: payload.actor,
        dto: payload.dto,
      },
    });

    if (payload.meta.signature !== expected) {
      throw new ForbiddenException('Domain event signature mismatch');
    }
  }

  private assertCatalogCompatibility(event: PersistedEventRecord) {
    const catalog = DOMAIN_EVENT_CATALOG[event.eventName as DomainEventName];

    if (!catalog) {
      throw new BadRequestException(`Unsupported domain event ${event.eventName}`);
    }

    if (catalog.version !== event.eventVersion) {
      throw new BadRequestException(
        `Unsupported event version for ${event.eventName}: ${event.eventVersion}`,
      );
    }
  }

  private assertContextConsistency(
    event: PersistedEventRecord,
    payload: PersistedDomainEventPayload,
  ) {
    const snapshot = payload.actor;
    const dto = payload.dto as unknown as Record<string, unknown>;

    if (snapshot.activeTenantId && snapshot.activeTenantId !== event.tenantId) {
      throw new ForbiddenException('Actor activeTenantId does not match persisted event tenant');
    }

    if (snapshot.tenantId !== event.tenantId) {
      throw new ForbiddenException('Actor tenantId does not match persisted event tenant');
    }

    if (
      Array.isArray(snapshot.allowedTenantIds) &&
      snapshot.allowedTenantIds.length > 0 &&
      !snapshot.allowedTenantIds.includes(event.tenantId)
    ) {
      throw new ForbiddenException('Actor allowedTenantIds do not authorize the persisted tenant');
    }

    const dtoBranchId = typeof dto.branchId === 'string' ? dto.branchId : null;
    if ((dtoBranchId ?? null) !== (event.branchId ?? null) && dtoBranchId !== null) {
      throw new ForbiddenException('DTO branchId does not match persisted branch context');
    }

    if (event.branchId) {
      if (
        snapshot.scope === AccessScope.BRANCH &&
        !snapshot.allowedBranchIds.includes(event.branchId)
      ) {
        throw new ForbiddenException('Actor branch scope does not authorize the persisted branch');
      }

      if (
        snapshot.activeBranchId &&
        snapshot.activeBranchId !== event.branchId &&
        !snapshot.allowedBranchIds.includes(event.branchId)
      ) {
        throw new ForbiddenException('Actor branch context does not authorize the persisted branch');
      }

      if (
        snapshot.allowedBranchIds.length > 0 &&
        !snapshot.allowedBranchIds.includes(event.branchId) &&
        snapshot.roleScope !== RoleScope.TENANT_ADMIN
      ) {
        throw new ForbiddenException('Actor allowedBranchIds do not authorize the persisted branch');
      }
    }
  }

  private validateDto(eventName: DomainEventName, dto: DomainEventDto) {
    const catalog = DOMAIN_EVENT_CATALOG[eventName];
    const instance = plainToInstance<object, DomainEventDto>(catalog.dtoClass, dto);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const message = errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .filter(Boolean)
        .join('; ');
      throw new BadRequestException(
        `Invalid payload for ${eventName}: ${message || 'validation failed'}`,
      );
    }
  }

  private computeSignature(envelope: SignableEnvelope) {
    return createHmac('sha256', this.signingSecret)
      .update(this.stableStringify(this.toSignableObject(envelope)))
      .digest('hex');
  }

  private toSignableObject(envelope: SignableEnvelope) {
    return {
      eventName: envelope.eventName,
      eventVersion: envelope.eventVersion,
      occurredAt: envelope.occurredAt.toISOString(),
      tenantId: envelope.tenantId,
      branchId: envelope.branchId ?? null,
      correlationId: envelope.correlationId,
      causationId: envelope.causationId ?? null,
      idempotencyKey: envelope.idempotencyKey,
      actor: envelope.payload.actor,
      dto: envelope.payload.dto,
    };
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',')}}`;
  }
}
