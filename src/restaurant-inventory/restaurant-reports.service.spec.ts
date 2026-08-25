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
});
