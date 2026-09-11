import { RestaurantInventoryService } from './restaurant-inventory.service';

/**
 * Los tres datos que el listado no entregaba.
 *
 * En los tres casos el dato existía —en otra tabla, o sumando las líneas que ya
 * venían incluidas— y la pantalla acababa enseñando un hueco vacío o un cero
 * que nadie había calculado. Estas pruebas fijan lo que cada listado debe
 * añadir, y que no quita nada de lo que ya devolvía.
 */
describe('RestaurantInventoryService list joins', () => {
  const prisma: any = {};
  const service = new RestaurantInventoryService(prisma as never);
  const paginacion = {};

  beforeEach(() => {
    prisma.restaurantProductionOrder = { findMany: jest.fn(), count: jest.fn() };
    prisma.restaurantWasteRecord = { findMany: jest.fn(), count: jest.fn() };
    prisma.restaurantStockCount = { findMany: jest.fn(), count: jest.fn() };
    prisma.restaurantRecipe = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.branch = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.restaurantInventoryWarehouse = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.restaurantIngredient = { findMany: jest.fn().mockResolvedValue([]) };
    jest.spyOn(service as any, 'scope').mockResolvedValue(undefined);
  });

  describe('productions', () => {
    it('adds the recipe name and the consumed cost the preview already showed', async () => {
      prisma.restaurantRecipe.findMany.mockResolvedValue([{ id: 'rec-1', name: 'Salsa pomodoro' }]);
      prisma.restaurantProductionOrder.findMany.mockResolvedValue([
        {
          id: 'po-1', recipeId: 'rec-1', branchId: 'b1', warehouseId: 'w1', status: 'DRAFT', plannedQuantity: 10,
          items: [
            { ingredientId: 'ing-1', direction: 'OUT', quantity: 4, unitCost: 2.5 },
            { ingredientId: 'ing-2', direction: 'OUT', quantity: 2, unitCost: 1 },
            { ingredientId: 'ing-3', direction: 'IN', quantity: 10, unitCost: 9 },
          ],
        },
      ]);
      const [orden]: any = await service.productions('t1', paginacion);
      expect(orden.preparationName).toBe('Salsa pomodoro');
      expect(orden.recipeName).toBe('Salsa pomodoro');
      // Sólo las líneas de salida: lo que ENTRA es el producto terminado, no un costo consumido.
      expect(orden.consumedCost).toBe(12);
    });

    it('leaves the name null instead of guessing when the recipe is gone', async () => {
      prisma.restaurantProductionOrder.findMany.mockResolvedValue([{ id: 'po-1', recipeId: 'rec-borrada', status: 'DRAFT', items: [] }]);
      const [orden]: any = await service.productions('t1', paginacion);
      expect(orden.preparationName).toBeNull();
      expect(orden.consumedCost).toBe(0);
    });

    it('keeps every field the row already had', async () => {
      prisma.restaurantProductionOrder.findMany.mockResolvedValue([{ id: 'po-1', recipeId: 'rec-1', lotNumber: 'PRD-0007', plannedQuantity: 10, status: 'DRAFT', items: [] }]);
      const [orden]: any = await service.productions('t1', paginacion);
      expect(orden).toMatchObject({ id: 'po-1', lotNumber: 'PRD-0007', plannedQuantity: 10, status: 'DRAFT' });
    });
  });

  describe('wastes', () => {
    it('adds the total the screen was printing as zero', async () => {
      prisma.restaurantWasteRecord.findMany.mockResolvedValue([
        {
          id: 'wst-1', branchId: 'b1', warehouseId: 'w1', status: 'DRAFT', reason: 'Producto caducado',
          items: [
            { ingredientId: 'ing-1', quantity: 2, convertedInventoryQuantity: 2, unitCostSnapshot: 7.8 },
            { ingredientId: 'ing-2', quantity: 1, convertedInventoryQuantity: 1.5, unitCostSnapshot: 4 },
          ],
        },
      ]);
      const [merma]: any = await service.wastes('t1', paginacion);
      expect(merma.totalCost).toBeCloseTo(2 * 7.8 + 1.5 * 4);
      expect(merma.reason).toBe('Producto caducado');
    });

    it('a waste with no lines totals zero without blowing up', async () => {
      prisma.restaurantWasteRecord.findMany.mockResolvedValue([{ id: 'wst-1', status: 'DRAFT', items: [] }]);
      const [merma]: any = await service.wastes('t1', paginacion);
      expect(merma.totalCost).toBe(0);
    });
  });

  describe('stockCounts', () => {
    it('adds the warehouse name, which no other listing of the module was missing', async () => {
      prisma.restaurantInventoryWarehouse.findMany.mockResolvedValue([{ id: 'w1', name: 'Bodega principal', branchId: 'b1' }]);
      prisma.restaurantStockCount.findMany.mockResolvedValue([
        { id: 'cnt-1', countNumber: 'CNT-0004', branchId: 'b1', warehouseId: 'w1', status: 'IN_REVIEW', items: [{ ingredientId: 'ing-1', countedQuantity: 10, systemQuantity: 12, varianceQuantity: -2 }] },
      ]);
      const [conteo]: any = await service.stockCounts('t1', paginacion);
      expect(conteo.warehouseName).toBe('Bodega principal');
      expect(conteo.countNumber).toBe('CNT-0004');
    });

    it('still hides the theoretical quantity of a count that is not approved', async () => {
      prisma.restaurantStockCount.findMany.mockResolvedValue([
        { id: 'cnt-1', branchId: 'b1', warehouseId: 'w1', status: 'IN_REVIEW', items: [{ ingredientId: 'ing-1', countedQuantity: 10, systemQuantity: 12, varianceQuantity: -2 }] },
      ]);
      const [conteo]: any = await service.stockCounts('t1', paginacion);
      expect(conteo.items[0].systemQuantity).toBeUndefined();
      expect(conteo.items[0].varianceQuantity).toBeUndefined();
      expect(conteo.items[0].countedQuantity).toBe(10);
    });

    it('keeps showing the variance once the count is approved', async () => {
      prisma.restaurantStockCount.findMany.mockResolvedValue([
        { id: 'cnt-1', branchId: 'b1', warehouseId: 'w1', status: 'APPROVED', items: [{ ingredientId: 'ing-1', countedQuantity: 10, systemQuantity: 12, varianceQuantity: -2 }] },
      ]);
      const [conteo]: any = await service.stockCounts('t1', paginacion);
      expect(conteo.items[0].varianceQuantity).toBe(-2);
    });
  });
});
