import { RestaurantPurchasingService } from './restaurant-purchasing.service';

describe('RestaurantPurchasingService', () => {
  it('rejects a supplier from another tenant before creating an order', async () => {
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-1', branchId: 'branch-1' }) },
      restaurantInventorySupplier: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new RestaurantPurchasingService(prisma);
    await expect(service.create('tenant-1', 'user-1', { branchId: 'branch-1', warehouseId: 'warehouse-1', supplierId: 'supplier-other', code: 'PO-1', lines: [] })).rejects.toMatchObject({ response: { code: 'TENANT_ACCESS_DENIED' } });
  });

  it('enforces the order state machine and requires a reason for rejection', async () => {
    const prisma: any = { restaurantPurchaseOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'po-1', tenantId: 'tenant-1', status: 'DRAFT', lines: [] }), update: jest.fn() } };
    const service = new RestaurantPurchasingService(prisma);
    await expect(service.transition('tenant-1', 'user-1', 'po-1', 'reject')).rejects.toMatchObject({ response: { code: 'RESOURCE_CONFLICT' } });
    await expect(service.transition('tenant-1', 'user-1', 'po-1', 'approve')).rejects.toMatchObject({ response: { code: 'RESOURCE_CONFLICT' } });
  });

  it('calculates purchase suggestions from par level and average cost', async () => {
    const prisma: any = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-1', branchId: 'branch-1' }) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1', name: 'Tomato', minimumStock: 2, parLevel: 20, targetCoverageDays: 7, currentAverageCost: 4, status: 'ACTIVE' }]) },
      restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'ingredient-1', quantityOnHand: 4 }]) },
    };
    const service = new RestaurantPurchasingService(prisma);
    await expect(service.suggestions('tenant-1', { branchId: 'branch-1', warehouseId: 'warehouse-1' })).resolves.toEqual([expect.objectContaining({ suggestedQuantity: 16, estimatedCost: 64 })]);
  });
});
