import { ModuleCode, SubscriptionStatus } from '@prisma/client';
import { Request } from 'express';
import { AccessScope } from '../enums/access-scope.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export type RequestWithUser = Request & {
  auditAction?: string;
  auditDomain?: 'governance_global' | 'tenant_operations';
  user: JwtPayload;
  accessContext?: {
    actorScope: AccessScope;
    isGlobalRoute: boolean;
    resolvedTenantId: string | null;
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
  };
};
