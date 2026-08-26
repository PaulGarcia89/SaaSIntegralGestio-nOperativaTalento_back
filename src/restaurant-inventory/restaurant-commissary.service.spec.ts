import { RestaurantCommissaryService } from './restaurant-commissary.service';

describe('RestaurantCommissaryService', () => {
  const dto = {
    name: 'Central Norte',
    code: 'CENT-N',
    centralBranchId: 'branch-central',
    centralWarehouseId: 'warehouse-central',
    servedBranchIds: ['branch-a', 'branch-b'],
    ingredientIds: ['ingredient-1'],
    recipeIds: ['recipe-1'],
    productionCapacity: 100,
    productionCalendar: { monday: ['08:00-16:00'] },
  };

  function prisma(overrides: any = {}) {
    const tx = {
      restaurantCommissary: { create: jest.fn().mockResolvedValue({ id: 'commissary-1', status: 'INACTIVE' }), update: jest.fn() },
      restaurantCommissaryBranch: { deleteMany: jest.fn() },
      restaurantCommissaryIngredient: { deleteMany: jest.fn() },
      restaurantCommissaryRecipe: { deleteMany: jest.fn() },
    };
    return {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-central' }), findMany: jest.fn().mockResolvedValue([{ id: 'branch-a' }, { id: 'branch-b' }]) },
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-central', branchId: 'branch-central' }) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1' }]) },
      restaurantRecipe: { findMany: jest.fn().mockResolvedValue([{ id: 'recipe-1' }]) },
      restaurantCommissary: { findFirst: jest.fn().mockResolvedValue({ id: 'commissary-1', tenantId: 'tenant-1', status: 'INACTIVE', servedBranches: [], allowedIngredients: [], producedRecipes: [] }), findMany: jest.fn(), count: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'commissary-1', status: 'ACTIVE' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      ...overrides,
      __tx: tx,
    };
  }

  it('creates a tenant-scoped configuration without creating inventory movements', async () => {
    const db: any = prisma();
    const result = await new RestaurantCommissaryService(db).create('tenant-1', 'user-1', dto);
    expect(result).toMatchObject({ id: 'commissary-1' });
    expect(db.__tx.restaurantCommissary.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', code: 'CENT-N', createdBy: 'user-1' }) }));
    expect(db.restaurantInventoryMovement).toBeUndefined();
  });

  it('rejects references outside the tenant or a warehouse from another branch', async () => {
    const db: any = prisma({ restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-central', branchId: 'other-branch' }) } });
    await expect(new RestaurantCommissaryService(db).create('tenant-1', 'user-1', dto)).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow a duplicate code and supports idempotent state transitions', async () => {
    const db: any = prisma({ $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }) });
    await expect(new RestaurantCommissaryService(db).create('tenant-1', 'user-1', dto)).rejects.toMatchObject({ status: 409 });
    const transitionDb: any = prisma();
    const service = new RestaurantCommissaryService(transitionDb);
    await expect(service.transition('tenant-1', 'user-1', 'commissary-1', 'ACTIVE' as any)).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(transitionDb.restaurantCommissary.update).toHaveBeenCalled();
  });
});
