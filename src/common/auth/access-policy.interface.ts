import { ModuleCode } from '@prisma/client';
import { SubscriptionAccessState } from './subscription-access-state.enum';

export type AccessPolicy = {
  permission?: string;
  module?: ModuleCode;
  tenantRequired?: boolean;
  branchRequired?: boolean;
  allowedSubscriptionStates?: SubscriptionAccessState[];
};
