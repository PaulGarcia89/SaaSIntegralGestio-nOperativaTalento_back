import { ModuleCode, SubscriptionStatus } from '@prisma/client';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export type RequestWithUser = Request & {
  auditAction?: string;
  user: JwtPayload;
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
