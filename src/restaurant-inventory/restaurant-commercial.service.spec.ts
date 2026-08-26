import { RestaurantCommercialService } from './restaurant-commercial.service';
import { RestaurantPurchasingService } from './restaurant-purchasing.service';

describe('RestaurantCommercialService', () => {
  it('forecasts demand only from confirmed consumption and preserves tenant scope', async () => {
    const previousMinimum = process.env.RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS;
    process.env.RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS = '1';
    const prisma = {
      restaurantConsumptionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'CONFIRMED', branchId: 'branch-1', warehouseId: 'warehouse-1', consumptionDate: new Date('2026-08-10'), items: [{ recipeId: 'recipe-1', quantitySold: 2 }] },
        ]),
      },
      restaurantRecipe: {
        findMany: jest.fn().mockResolvedValue([{ id: 'recipe-1', items: [{ ingredientId: 'ingredient-1', convertedInventoryQuantity: 3 }] }]),
      },
      restaurantIngredient: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1', sku: 'TOM', name: 'Tomate', inventoryUnitId: 'unit-1', currentAverageCost: 2 }]),
      },
      restaurantInventoryUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-1', name: 'Kilogramo', abbreviation: 'kg' }]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'branch-1', name: 'Centro' }]) },
    };
    const service = new RestaurantCommercialService(prisma as never);

    const result = await service.demandForecast('tenant-1', {
      periodStart: '2026-08-10T00:00:00.000Z',
      periodEnd: '2026-08-10T00:00:00.000Z',
      horizon: 1,
      granularity: 'daily',
    });

    expect(result.rows[0]).toMatchObject({ historicalDemandUsed: 6, forecastQuantity: 6, status: 'READY', unit: { abbreviation: 'kg' }, branch: { id: 'branch-1' } });
    expect(prisma.restaurantConsumptionRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', status: 'CONFIRMED' }) }));
    if (previousMinimum === undefined) delete process.env.RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS;
    else process.env.RESTAURANT_COMMERCIAL_FORECAST_MIN_HISTORY_DAYS = previousMinimum;
  });

  it('returns insufficient history and applies category, branch, warehouse and weekly filters', async () => {
    const prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-a' }), findMany: jest.fn().mockResolvedValue([{ id: 'branch-a', name: 'Norte' }]) },
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-a', branchId: 'branch-a' }) },
      restaurantConsumptionRecord: { findMany: jest.fn().mockResolvedValue([{ branchId: 'branch-a', warehouseId: 'warehouse-a', consumptionDate: new Date('2026-08-01'), items: [{ recipeId: 'recipe-1', quantitySold: 1 }] }]) },
      restaurantRecipe: { findMany: jest.fn().mockResolvedValue([{ id: 'recipe-1', items: [{ ingredientId: 'ingredient-1', convertedInventoryQuantity: 1 }] }]) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-1', sku: 'A', name: 'A', inventoryUnitId: 'unit-1', categoryId: 'category-a', currentAverageCost: 1 }]) },
      restaurantInventoryUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-1', name: 'Unidad', abbreviation: 'u' }]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RestaurantCommercialService(prisma as never);
    const result = await service.demandForecast('tenant-a', { branchId: 'branch-a', warehouseId: 'warehouse-a', categoryId: 'category-a', from: '2026-08-01', to: '2026-08-02', horizon: 2, granularity: 'weekly' });
    expect(result.rows[0]).toMatchObject({ status: 'INSUFFICIENT_HISTORY', forecastQuantity: null, lowerBound: null, upperBound: null });
    expect(prisma.restaurantConsumptionRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', branchId: 'branch-a', warehouseId: 'warehouse-a' }) }));
    expect(prisma.restaurantIngredient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', categoryId: 'category-a' }) }));
  });

  it('aggregates branch costs and recipe margins with decimal rounding', async () => {
    const prisma = {
      restaurantInventoryMovement: { groupBy: jest.fn().mockResolvedValue([{ branchId: 'branch-1', direction: 'OUT', movementType: 'CONSUMPTION', referenceType: 'CONSUMPTION', _sum: { totalCost: 1.234 } }, { branchId: 'branch-1', direction: 'OUT', movementType: 'CONSUMPTION', referenceType: 'CONSUMPTION', _sum: { totalCost: 2.345 } }]) },
      restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantStockCount: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantRecipeVersion: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'branch-1', name: 'Centro' }]) },
      restaurantConsumptionRecord: { findMany: jest.fn().mockResolvedValue([{ branchId: 'branch-1', warehouseId: 'warehouse-1', items: [{ recipeId: 'recipe-1', quantitySold: 2, totalCost: 3.333, sellingPriceSnapshot: 5 }] }]) },
      restaurantRecipe: { findMany: jest.fn().mockResolvedValue([{ id: 'recipe-1', code: 'PL-1', name: 'Plato' }]) },
    };
    const service = new RestaurantCommercialService(prisma as never);

    await expect(service.branchCosts('tenant-1', {})).resolves.toMatchObject({ rows: [{ branch: { id: 'branch-1', name: 'Centro' }, consumptionCost: 3.58, purchasesConfirmed: 0, foodCostPercent: 35.79 }] });
    await expect(service.recipeMargins('tenant-1', {})).resolves.toMatchObject({ rows: [{ recipe: { id: 'recipe-1', code: 'PL-1', name: 'Plato' }, revenue: 10, totalCost: 3.33, margin: 6.67, marginPercent: 66.67, status: 'OK' }] });
  });

  it('rejects an invalid period before querying commercial data', async () => {
    const prisma = { restaurantConsumptionRecord: { findMany: jest.fn() } };
    const service = new RestaurantCommercialService(prisma as never);
    await expect(service.demandForecast('tenant-1', { periodStart: '2026-08-20', periodEnd: '2026-08-19' })).rejects.toMatchObject({ status: 422 });
    expect(prisma.restaurantConsumptionRecord.findMany).not.toHaveBeenCalled();
  });

  it('uses the historical recipe version, includes subrecipe production cost and flags margin problems', async () => {
    const prisma = {
      restaurantConsumptionRecord: { findMany: jest.fn().mockResolvedValue([{ branchId: 'branch-1', consumptionDate: new Date('2026-08-10'), items: [{ recipeId: 'recipe-1', recipeVersion: 1, quantitySold: 2, sellingPriceSnapshot: 2, totalCost: 6 }, { recipeId: 'recipe-2', recipeVersion: 1, quantitySold: 1, sellingPriceSnapshot: 0, totalCost: 3 }] }]) },
      restaurantRecipe: { findMany: jest.fn().mockResolvedValue([{ id: 'recipe-1', code: 'PL-1', name: 'Plato', categoryId: 'cat-1', type: 'MENU_ITEM', status: 'ACTIVE' }, { id: 'recipe-2', code: 'PL-2', name: 'Sin precio', categoryId: 'cat-1', type: 'MENU_ITEM', status: 'ACTIVE' }]) },
      restaurantRecipeVersion: { findMany: jest.fn().mockResolvedValue([
        { id: 'version-1', recipeId: 'recipe-1', versionNumber: 1, status: 'PUBLISHED', publishedAt: new Date('2026-01-01'), portions: 2, sellingPriceSnapshot: 2, components: [{ componentType: 'INGREDIENT', totalCostSnapshot: 4 }, { componentType: 'SUB_RECIPE', totalCostSnapshot: 2 }] },
        { id: 'version-2', recipeId: 'recipe-2', versionNumber: 1, status: 'PUBLISHED', publishedAt: new Date('2026-01-01'), portions: 1, sellingPriceSnapshot: null, components: [{ componentType: 'INGREDIENT', totalCostSnapshot: 3 }] },
      ]) },
    };
    const service = new RestaurantCommercialService(prisma as never);
    const result = await service.recipeMargins('tenant-1', { from: '2026-08-01', to: '2026-08-31', categoryId: 'cat-1' });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipe: expect.objectContaining({ id: 'recipe-1' }), ingredientCost: 4, productionCost: 2, totalCost: 6, margin: -2, status: 'NEGATIVE_MARGIN', recipeVersionUsed: expect.objectContaining({ versionNumber: 1 }) }),
      expect.objectContaining({ recipe: expect.objectContaining({ id: 'recipe-2' }), status: 'MISSING_SELLING_PRICE', foodCost: null }),
    ]));
    expect(prisma.restaurantRecipe.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', categoryId: 'cat-1' }) }));
  });

  it('creates budgets with tenant context and rejects duplicate codes', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'budget-1', code: 'AUG-2026' });
    const prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      restaurantCommercialBudget: { create },
      $transaction: jest.fn(async (callback: any) => callback({ restaurantCommercialBudget: { findFirst: jest.fn().mockResolvedValue(null), create } })),
    };
    const service = new RestaurantCommercialService(prisma as never);
    await expect(service.createBudget('tenant-1', 'user-1', {
      branchId: 'branch-1', code: 'aug-2026', periodStart: '2026-08-01', periodEnd: '2026-08-31', budgetAmount: 1000,
    })).resolves.toMatchObject({ code: 'AUG-2026' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', createdBy: 'user-1', code: 'AUG-2026' }) }));
  });

  it('ranks authorized branches and normalizes purchase cost by confirmed sales', async () => {
    const prisma = { branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) } };
    const service = new RestaurantCommercialService(prisma as never);
    jest.spyOn(service, 'branchCosts').mockResolvedValue({ rows: [
      { branch: { id: 'branch-1', name: 'Centro' }, purchasesConfirmed: 100, salesRevenue: 1000, changeVsPreviousPeriod: { purchasesConfirmed: 10 } },
      { branch: { id: 'branch-2', name: 'Norte' }, purchasesConfirmed: 50, salesRevenue: 200, changeVsPreviousPeriod: { purchasesConfirmed: -5 } },
    ], period: { start: new Date('2026-08-01'), end: new Date('2026-08-31') } } as any);
    const result = await service.unitComparison('tenant-1', { branchIds: ['branch-1', 'branch-2'], from: '2026-08-01', to: '2026-08-31', metric: 'purchase_cost', normalized: true, sortOrder: 'asc' }, ['branch-1', 'branch-2'], false);
    expect(result.rows).toMatchObject([
      { unit: { id: 'branch-1' }, value: 10, ranking: 1, networkAverage: 17.5, normalization: { basis: 'sales' } },
      { unit: { id: 'branch-2' }, value: 25, ranking: 2 },
    ]);
  });

  it('rejects comparison branches outside the user authorization scope', async () => {
    const service = new RestaurantCommercialService({} as never);
    await expect(service.unitComparison('tenant-1', { branchIds: ['branch-other'], from: '2026-08-01', to: '2026-08-31', metric: 'consumption_cost' }, ['branch-allowed'], false)).rejects.toMatchObject({ status: 403 });
  });

  it('approves and closes budgets idempotently under a row lock', async () => {
    const current = { id: 'budget-1', tenantId: 'tenant-1', status: 'PENDING_APPROVAL', budgetAmount: 100, committedAmount: 25, receivedAmount: 0 };
    const update = jest.fn().mockResolvedValue({ ...current, status: 'APPROVED', approvedBy: 'user-1' });
    const tx = { $queryRawUnsafe: jest.fn(), restaurantCommercialBudget: { findFirst: jest.fn().mockResolvedValue(current), update } };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new RestaurantCommercialService(prisma as never);
    await expect(service.approveBudget('tenant-1', 'user-1', 'budget-1')).resolves.toMatchObject({ status: 'APPROVED', remainingAmount: 75 });
    expect(tx.$queryRawUnsafe).toHaveBeenCalled();
    tx.restaurantCommercialBudget.findFirst.mockResolvedValue({ ...current, status: 'APPROVED' });
    await expect(service.approveBudget('tenant-1', 'user-1', 'budget-1')).resolves.toMatchObject({ status: 'APPROVED' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('blocks order approval when an active budget uses BLOCK policy', async () => {
    const commercial = { assertOrderWithinBudgetTx: jest.fn().mockRejectedValue(new Error('budget exceeded')) };
    const order = { id: 'po-1', tenantId: 'tenant-1', status: 'PENDING_APPROVAL', branchId: 'branch-1', warehouseId: 'warehouse-1', createdAt: new Date(), lines: [] };
    const tx = { $queryRawUnsafe: jest.fn(), restaurantPurchaseOrder: { findFirst: jest.fn().mockResolvedValue(order), update: jest.fn() } };
    const prisma = { restaurantPurchaseOrder: { findFirst: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const purchasing = new RestaurantPurchasingService(prisma as never, commercial as never);
    await expect(purchasing.transition('tenant-1', 'user-1', 'po-1', 'approve')).rejects.toThrow('budget exceeded');
    expect(tx.restaurantPurchaseOrder.update).not.toHaveBeenCalled();
  });
});
