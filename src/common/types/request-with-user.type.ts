import { ModuleCode, SubscriptionStatus } from '@prisma/client';
import { Request } from 'express';
import { SubscriptionAccessState } from '../auth/subscription-access-state.enum';
import { AccessScope } from '../enums/access-scope.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export type RequestWithUser = Request & {
  requestId?: string;
  auditAction?: string;
  auditDomain?: 'governance_global' | 'tenant_operations';
  auditEntityType?: string;
  auditEntityId?: string;
  auditBefore?: Record<string, unknown> | null;
  auditAfter?: Record<string, unknown> | null;
  user: JwtPayload;
  accessContext?: {
    actorScope: AccessScope;
    isGlobalRoute: boolean;
    resolvedTenantId: string | null;
  };
  restaurantInventoryContext?: {
    companyId: string;
    branchId: string | null;
    warehouseId: string | null;
  };
  tenant?: {
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  };
  branch?: {
    id: string;
    tenantId: string;
    name: string;
    location: string;
  };
  branchScope?: {
    allowedBranchIds: string[];
    activeBranchId: string | null;
  };
  subscription?: {
    id: string;
    planId: string;
    status: SubscriptionStatus;
    modules: ModuleCode[];
    accessStatus?: SubscriptionAccessState;
    graceEndsAt?: string | null;
  };
};
