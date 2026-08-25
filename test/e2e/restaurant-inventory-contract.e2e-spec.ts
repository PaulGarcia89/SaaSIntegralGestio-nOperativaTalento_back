import { RestaurantInventoryContextGuard } from '../../src/restaurant-inventory/restaurant-inventory-context.guard';
import { ErrorCode } from '../../src/common/errors/error-code.enum';

const describeInventoryE2e = process.env.RUN_RESTAURANT_INVENTORY_E2E === '1' ? describe : describe.skip;

describeInventoryE2e('Restaurant inventory E2E contract', () => {
  it('requires tenant context before any inventory operation', async () => {
    const guard = new RestaurantInventoryContextGuard({} as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ query: {}, body: {}, user: {} }) }) } as any;

    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: ErrorCode.TENANT_CONTEXT_REQUIRED } });
  });

  it('is enabled only with an isolated integration database', () => {
    expect(process.env.RUN_RESTAURANT_INVENTORY_E2E).toBe('1');
  });
});
