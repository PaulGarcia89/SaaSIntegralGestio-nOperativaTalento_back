import { RestaurantReportsService } from './restaurant-reports.service';

describe('RestaurantReportsService', () => {
  it('calculates valued stock in the backend', async () => {
    const prisma = { restaurantIngredient: { findMany: jest.fn().mockResolvedValue([]) }, restaurantRecipe: { findMany: jest.fn().mockResolvedValue([]) }, restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'i1', quantityOnHand: 4, averageCost: 2.5 }]) } };
    const service = new RestaurantReportsService(prisma as never);
    await expect(service.report('tenant-1', 'valued-stock', {})).resolves.toMatchObject({ rows: [{ value: 10 }], total: 1, page: 1 });
  });

  it('applies backend ordering and pagination to report rows', async () => {
    const prisma = { restaurantIngredient: { findMany: jest.fn().mockResolvedValue([]) }, restaurantRecipe: { findMany: jest.fn().mockResolvedValue([]) }, restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'b', quantityOnHand: 1, averageCost: 1, updatedAt: new Date() }, { ingredientId: 'a', quantityOnHand: 2, averageCost: 1, updatedAt: new Date() }]) } };
    const service = new RestaurantReportsService(prisma as never);
    await expect(service.report('tenant-1', 'valued-stock', { sort: 'ingredientId', pageSize: 1 })).resolves.toMatchObject({ rows: [{ ingredientId: 'a' }], total: 2, totalPages: 2 });
  });

  it('escapes spreadsheet formula prefixes during export', async () => {
    const service = new RestaurantReportsService({} as never);
    jest.spyOn(service, 'report').mockResolvedValue({ columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }], rows: [{ name: '=FORMULA()', value: 1 }] } as any);
    const result = await service.exportCsv('tenant-1', 'user-1', 'audit', {});
    expect(result.content).toContain("'=FORMULA()");
  });

  it('aggregates consumption cost by ingredient', async () => {
    const prisma = {
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', name: 'Tomate', minimumStock: 2, categoryId: 'c1' }]) },
      restaurantRecipe: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'i1', quantity: 2, totalCost: 5 }, { ingredientId: 'i1', quantity: 3, totalCost: 7 }]) },
    };
    const service = new RestaurantReportsService(prisma as never);

    await expect(service.report('tenant-1', 'consumption-by-ingredient', { categoryId: 'c1' })).resolves.toMatchObject({ rows: [{ ingredientId: 'i1', quantity: 5, totalCost: 12 }], total: 1 });
  });

  it('rejects invalid date ranges and caps page size', async () => {
    const prisma = { restaurantIngredient: { findMany: jest.fn().mockResolvedValue([]) }, restaurantRecipe: { findMany: jest.fn().mockResolvedValue([]) }, restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new RestaurantReportsService(prisma as never);

    await expect(service.report('tenant-1', 'valued-stock', { from: '2026-08-20', to: '2026-08-19' })).rejects.toThrow('Rango de fechas');
    await expect(service.report('tenant-1', 'valued-stock', { pageSize: 1000 })).resolves.toMatchObject({ pageSize: 200 });
  });

  it('calculates theoretical versus counted variance using confirmed movements up to the count', async () => {
    const countedAt = new Date('2026-08-20T00:00:00.000Z');
    const prisma = {
      restaurantStockCount: { findMany: jest.fn().mockResolvedValue([{ id: 'count-1', countNumber: 'CNT-1', countedAt, status: 'APPROVED', createdBy: 'user-1', branchId: 'branch-1', warehouseId: 'warehouse-1', items: [{ ingredientId: 'ingredient-1', countedQuantity: 8, averageCost: 2 }] }]) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1', sku: 'TOM', name: 'Tomate', categoryId: 'category-1', inventoryUnitId: 'unit-1' }]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'ingredient-1', direction: 'IN', quantity: 10, occurredAt: new Date('2026-08-19T00:00:00.000Z') }, { ingredientId: 'ingredient-1', direction: 'OUT', quantity: 3, occurredAt: new Date('2026-08-19T12:00:00.000Z') }, { ingredientId: 'ingredient-1', direction: 'OUT', quantity: 99, occurredAt: new Date('2026-08-21T00:00:00.000Z') }]) },
      restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'ingredient-1', averageCost: 2 }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com' }]) },
    };
    const service = new RestaurantReportsService(prisma as never);

    const result = await service.variance('tenant-1', { branchId: 'branch-1', warehouseId: 'warehouse-1', pageSize: 10 });

    expect(result.rows[0]).toMatchObject({ theoreticalQuantity: 7, countedQuantity: 8, absoluteVariance: 1, percentageVariance: 14.2857, theoreticalCost: 14, realCost: 16, monetaryDifference: 2, reviewStatus: 'REVIEW_REQUIRED' });
    expect(result.rows[0].responsibleUser).toMatchObject({ name: 'Ana Lopez' });
  });

  it('keeps variance data isolated by the tenant and applies filters and pagination', async () => {
    const prisma = {
      restaurantStockCount: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RestaurantReportsService(prisma as never);
    await service.variance('tenant-a', { branchId: 'branch-a', warehouseId: 'warehouse-a', ingredientId: 'ingredient-a', categoryId: 'category-a', page: 2, pageSize: 1 });
    expect(prisma.restaurantStockCount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', branchId: 'branch-a', warehouseId: 'warehouse-a', status: 'APPROVED' }) }));
    expect(prisma.restaurantIngredient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', id: 'ingredient-a', categoryId: 'category-a' } }));
  });
});
