import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CandidateHiredDto } from './dto/candidate-hired.dto';
import { SimpleDomainEventDto } from './dto/simple-domain-event.dto';

export const DOMAIN_EVENT_NAMES = {
  CANDIDATE_HIRED: 'candidate.hired',
  EMPLOYEE_BRANCH_CHANGED: 'employee.branch_changed',
  EMPLOYEE_OFFBOARDING_STARTED: 'employee.offboarding_started',
  ONBOARDING_COMPLETED: 'onboarding.completed',
  INVENTORY_ASSET_ASSIGNED: 'inventory.asset_assigned',
  TRAINING_COMPLETED: 'training.completed',
  OPERATION_HANDOFF_COMPLETED: 'operation.handoff_completed',
  COMPLIANCE_CLOSED: 'compliance.closed',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENT_NAMES)[keyof typeof DOMAIN_EVENT_NAMES];

export const DOMAIN_EVENT_VERSION = 1;

export const DOMAIN_EVENT_CATALOG = {
  [DOMAIN_EVENT_NAMES.CANDIDATE_HIRED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'candidate',
    dtoClass: CandidateHiredDto,
  },
  [DOMAIN_EVENT_NAMES.EMPLOYEE_BRANCH_CHANGED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.EMPLOYEE_OFFBOARDING_STARTED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.ONBOARDING_COMPLETED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.INVENTORY_ASSET_ASSIGNED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.TRAINING_COMPLETED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.OPERATION_HANDOFF_COMPLETED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
  [DOMAIN_EVENT_NAMES.COMPLIANCE_CLOSED]: {
    version: DOMAIN_EVENT_VERSION,
    aggregateType: 'employee',
    dtoClass: SimpleDomainEventDto,
  },
} as const satisfies Record<
  DomainEventName,
  {
    version: number;
    aggregateType: string;
    dtoClass: new () => object;
  }
>;

export type DomainEventDto = CandidateHiredDto | SimpleDomainEventDto;

export type DomainEventActorSnapshot = Pick<
  JwtPayload,
  | 'sub'
  | 'userId'
  | 'tenantId'
  | 'allowedTenantIds'
  | 'activeTenantId'
  | 'tenantSlug'
  | 'tenantName'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'role'
  | 'scope'
  | 'isSuperAdmin'
  | 'roleScope'
  | 'allowedBranchIds'
  | 'activeBranchId'
  | 'roles'
  | 'permissions'
  | 'enabledModules'
  | 'isGlobalContext'
  | 'impersonation'
  | 'subscriptionStatus'
  | 'subscriptionGraceEndsAt'
>;

export type DomainEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventName: DomainEventName;
  eventVersion: number;
  occurredAt: Date;
  tenantId: string;
  branchId?: string | null;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey: string;
  payload: TPayload;
};

export type PersistedDomainEventPayload = {
  actor: DomainEventActorSnapshot;
  dto: DomainEventDto;
  meta: DomainEventPayloadMetadata;
};

export type UnsignedDomainEventPayload = Omit<PersistedDomainEventPayload, 'meta'>;

export type DomainEventPayloadMetadata = {
  producer: 'backend';
  signatureAlgorithm: 'hmac-sha256';
  signature: string;
  signedAt: string;
};
