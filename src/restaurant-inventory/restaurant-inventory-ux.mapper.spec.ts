import { mapBalanceForUx, mapLotForUx, mapMovementForUx, previewUx, resolveNextAction } from './restaurant-inventory-ux.mapper';

describe('restaurant inventory UX mappers', () => {
  it('derives stable stock status and next action without changing source fields', () => {
    const result = mapBalanceForUx({ id: 'balance-1', quantityOnHand: 2, minimumStock: 5 }, { total: 1, available: 1, expiring: 0 });
    expect(result).toMatchObject({ id: 'balance-1', quantityOnHand: 2, stockStatus: 'LOW_STOCK', blocked: true, nextAction: 'create_purchase_or_receipt' });
  });

  it('normalizes preview blocking consistently', () => {
    expect(previewUx({ totalCost: 10 }, [{ shortageQuantity: 2 }])).toMatchObject({ blocked: true, nextAction: 'resolve_stock_shortage' });
    expect(previewUx({ totalCost: 10 }, [{ shortageQuantity: 0 }])).toMatchObject({ blocked: false, nextAction: 'confirm_operation' });
  });

  it('keeps stable action codes for operations and lot status', () => {
    expect(resolveNextAction('DRAFT')).toBe('confirm_operation');
    expect(mapMovementForUx({ movementType: 'CONSUMPTION', direction: 'OUT', ingredientName: 'Tomate' })).toMatchObject({ displayDirection: 'Salida', activityDescription: 'Salida de inventario: Tomate' });
    expect(mapLotForUx({ remainingQuantity: 3, expirationDate: '2020-01-01T00:00:00.000Z' })).toMatchObject({ lotStatus: 'EXPIRED' });
  });
});
