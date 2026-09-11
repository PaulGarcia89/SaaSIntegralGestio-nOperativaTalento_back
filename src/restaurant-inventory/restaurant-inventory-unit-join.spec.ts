import { RestaurantInventoryService } from './restaurant-inventory.service';

/**
 * La unidad de medida en lotes y alertas de vencimiento.
 *
 * `balances()` hacía este join y por eso las existencias se leían «4,5 kg»;
 * `lots()` y `expiryAlerts()` no lo hacían y la misma cantidad salía como «6»
 * a secas. Seis kilos y seis unidades de un producto de cinco litros son cosas
 * distintas, así que una cantidad sin unidad no se puede verificar contra el
 * estante.
 */
describe('RestaurantInventoryService ingredient unit join', () => {
  const findMany = jest.fn();
  const service = new RestaurantInventoryService({
    restaurantIngredient: { findMany },
    restaurantInventoryUnit: { findMany },
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('adds the ingredient unit to rows that only carried its id', async () => {
    findMany
      .mockResolvedValueOnce([{ id: 'ing-1', inventoryUnitId: 'u-kg' }])
      .mockResolvedValueOnce([{ id: 'u-kg', name: 'Kilogramo', abbreviation: 'kg' }]);
    const rows = await (service as any).withIngredientUnit('t1', [{ id: 'lot-1', ingredientId: 'ing-1', remainingQuantity: 6 }]);
    expect(rows[0]).toMatchObject({ unitId: 'u-kg', unitName: 'Kilogramo', unitAbbreviation: 'kg' });
  });

  it('never removes or renames the fields the row already had', async () => {
    findMany
      .mockResolvedValueOnce([{ id: 'ing-1', inventoryUnitId: 'u-kg' }])
      .mockResolvedValueOnce([{ id: 'u-kg', name: 'Kilogramo', abbreviation: 'kg' }]);
    const original = { id: 'lot-1', ingredientId: 'ing-1', lotNumber: 'L-22', expirationDate: '2026-09-14', remainingQuantity: 6, unitCost: 3.2 };
    const rows = await (service as any).withIngredientUnit('t1', [original]);
    expect(rows[0]).toMatchObject(original);
  });

  it('leaves the unit null when the ingredient has no unit rather than guessing one', async () => {
    findMany
      .mockResolvedValueOnce([{ id: 'ing-1', inventoryUnitId: 'u-missing' }])
      .mockResolvedValueOnce([]);
    const rows = await (service as any).withIngredientUnit('t1', [{ id: 'lot-1', ingredientId: 'ing-1' }]);
    expect(rows[0]).toMatchObject({ unitId: null, unitName: null, unitAbbreviation: null });
  });

  it('does not query anything when no row carries an ingredient', async () => {
    const rows = await (service as any).withIngredientUnit('t1', [{ id: 'lot-1' }]);
    expect(findMany).not.toHaveBeenCalled();
    expect(rows).toEqual([{ id: 'lot-1' }]);
  });
});
