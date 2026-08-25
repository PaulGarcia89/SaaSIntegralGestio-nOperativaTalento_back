import { HttpStatus } from '@nestjs/common';
import { RestaurantInventoryContextGuard } from './restaurant-inventory-context.guard';
import { ErrorCode } from '../common/errors/error-code.enum';
import { AccessScope } from '../common/enums/access-scope.enum';

describe('RestaurantInventoryContextGuard', () => {
  const branch = { findFirst: jest.fn() };
  const warehouse = { findFirst: jest.fn() };
  const guard = new RestaurantInventoryContextGuard({ branch, restaurantInventoryWarehouse: warehouse } as any);
  const context = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('rejects requests without tenant context using the normalized error', async () => {
    await expect(guard.canActivate(context({ query: {}, body: {}, user: {} }))).rejects.toMatchObject({ response: { code: ErrorCode.TENANT_CONTEXT_REQUIRED, status: HttpStatus.FORBIDDEN } });
  });

  it('rejects a branch outside the tenant and user branch scope', async () => {
    branch.findFirst.mockResolvedValue({ id: 'branch-1' });
    await expect(guard.canActivate(context({
      query: { branchId: 'branch-1' }, body: {}, tenant: { id: 'tenant-1' },
      user: { scope: AccessScope.BRANCH, allowedBranchIds: ['branch-2'], isGlobalContext: false },
    }))).rejects.toMatchObject({ response: { code: ErrorCode.BRANCH_ACCESS_DENIED } });
  });

  it('accepts a tenant warehouse whose branch is within the user scope', async () => {
    branch.findFirst.mockResolvedValue({ id: 'branch-1' });
    warehouse.findFirst.mockResolvedValue({ id: 'warehouse-1', branchId: 'branch-1' });
    await expect(guard.canActivate(context({
      query: { branchId: 'branch-1', warehouseId: 'warehouse-1' }, body: {}, tenant: { id: 'tenant-1' },
      user: { scope: AccessScope.BRANCH, allowedBranchIds: ['branch-1'], isGlobalContext: false },
    }))).resolves.toBe(true);
  });
});
