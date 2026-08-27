import { ExecutionContext } from '@nestjs/common';
import { InventoryCapabilityCode } from '@prisma/client';
import { InventoryCapabilityGuard } from './inventory-capability.guard';

describe('InventoryCapabilityGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const capabilities = { assertEnabled: jest.fn() };
  const guard = new InventoryCapabilityGuard(reflector as never, capabilities as never);

  const context = (user: Record<string, unknown>, tenantId = 'tenant-1') =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, tenant: { id: tenantId } }) }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows routes without a capability requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
    expect(capabilities.assertEnabled).not.toHaveBeenCalled();
  });

  it('checks the tenant capability', async () => {
    reflector.getAllAndOverride.mockReturnValue(InventoryCapabilityCode.RESTAURANT_INVENTORY);
    capabilities.assertEnabled.mockResolvedValue(undefined);
    await expect(guard.canActivate(context({ role: 'TENANT_ADMIN', isGlobalContext: false }))).resolves.toBe(true);
    expect(capabilities.assertEnabled).toHaveBeenCalledWith('tenant-1', InventoryCapabilityCode.RESTAURANT_INVENTORY);
  });

  it('bypasses capability checks only for global superadmin context', async () => {
    reflector.getAllAndOverride.mockReturnValue(InventoryCapabilityCode.RESTAURANT_INVENTORY);
    await expect(guard.canActivate(context({ role: 'SUPERADMIN', isGlobalContext: true }))).resolves.toBe(true);
    expect(capabilities.assertEnabled).not.toHaveBeenCalled();
  });
});
