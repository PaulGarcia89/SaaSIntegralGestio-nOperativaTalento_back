import { SetMetadata } from '@nestjs/common';
import { InventoryCapabilityCode } from '@prisma/client';

export const INVENTORY_CAPABILITY_KEY = 'inventory_capability';

export const RequireInventoryCapability = (code: InventoryCapabilityCode) =>
  SetMetadata(INVENTORY_CAPABILITY_KEY, code);
