import { RestaurantCommissaryStatus } from '@prisma/client';
import { RestaurantCommercialController } from './restaurant-commercial.controller';

describe('RestaurantCommercialController frontend contracts', () => {
  const request: any = { tenant: { id: 'tenant-1' }, user: { sub: 'user-1', activeBranchId: 'branch-1', allowedBranchIds: ['branch-1'], isGlobalContext: false } };

  it('maps forecast, costs, margins and comparison to frontend DTO names', async () => {
    const commercial: any = {
      demandForecast: jest.fn().mockResolvedValue({ rows: [{ period: { start: '2026-08-01', end: '2026-08-31' }, ingredient: { id: 'i-1', name: 'Tomate' }, branch: { id: 'b-1' }, forecastQuantity: 4, confidence: 0.9, lowerBound: 2, upperBound: 6, unit: { abbreviation: 'kg' } }] }),
      branchCosts: jest.fn().mockResolvedValue({ rows: [{ period: { start: '2026-08-01', end: '2026-08-31' }, branch: { id: 'b-1', name: 'Centro' }, inventoryValue: 20, purchasesConfirmed: 10, consumptionCost: 4, foodCostPercent: 40, theoreticalRealVariance: -1 }] }),
      recipeMargins: jest.fn().mockResolvedValue({ rows: [{ period: { start: '2026-08-01', end: '2026-08-31' }, recipe: { id: 'r-1', name: 'Salsa' }, portionsSold: 3, revenue: 12, totalCost: 5, margin: 7, marginPercent: 58.3333 }] }),
      unitComparison: jest.fn().mockResolvedValue({ rows: [{ metric: 'purchase_cost', unit: { id: 'b-1', name: 'Centro' }, period: { start: '2026-08-01', end: '2026-08-31' }, value: 10, ranking: 1, changeVsPreviousPeriod: 2 }] }),
    };
    const controller = new RestaurantCommercialController(commercial, {} as never);
    await expect(controller.demand(request, {} as never)).resolves.toEqual([expect.objectContaining({ predictedQuantity: 4, ingredientId: 'i-1', unit: 'kg' })]);
    await expect(controller.costs(request, {} as never)).resolves.toEqual([expect.objectContaining({ branchId: 'b-1', purchaseCost: 10, inventoryCost: 20 })]);
    await expect(controller.margins(request, {} as never)).resolves.toEqual([expect.objectContaining({ recipeId: 'r-1', portions: 3, cost: 5 })]);
    await expect(controller.unitComparison(request, {} as never)).resolves.toEqual([expect.objectContaining({ rank: 1, changePercent: 2 })]);
  });

  it('accepts the existing frontend period/budget form and maps purchase budgets', async () => {
    const commercial: any = {
      budgets: jest.fn().mockResolvedValue({ rows: [{ id: 'budget-1', periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31T23:59:59.999Z'), branchId: 'branch-1', branchName: 'Centro', budgetAmount: 100, committedAmount: 30, receivedAmount: 10, remainingAmount: 70, utilizationPercent: 30, status: 'APPROVED' }] }),
      createBudget: jest.fn().mockResolvedValue({ id: 'budget-1', periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31T23:59:59.999Z'), branchId: 'branch-1', budgetAmount: 100, committedAmount: 0, receivedAmount: 0, remainingAmount: 100, utilizationPercent: 0, status: 'DRAFT' }),
    };
    const controller = new RestaurantCommercialController(commercial, {} as never);
    await expect(controller.purchaseBudgets(request, {} as never)).resolves.toEqual([expect.objectContaining({ budget: 100, committed: 30, remaining: 70, branchName: 'Centro' })]);
    await controller.createPurchaseBudget(request, { period: '2026-08', budget: 100 } as any);
    expect(commercial.createBudget).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining({ branchId: 'branch-1', budgetAmount: 100, periodStart: expect.stringContaining('2026-08-01') }));
  });

  it('maps commissaries without exposing persistence-only join rows', async () => {
    const commissaries: any = { list: jest.fn().mockResolvedValue({ rows: [{ id: 'c-1', code: 'CENTRAL', name: 'Central', status: RestaurantCommissaryStatus.ACTIVE, servedBranches: [{}], allowedIngredients: [{}, {}], producedRecipes: [{}], updatedAt: new Date('2026-08-01') }] }) };
    const controller = new RestaurantCommercialController({} as never, commissaries);
    await expect(controller.listCommissaries(request, {} as never)).resolves.toEqual([expect.objectContaining({ branchCount: 1, itemsCount: 3 })]);
  });
});
