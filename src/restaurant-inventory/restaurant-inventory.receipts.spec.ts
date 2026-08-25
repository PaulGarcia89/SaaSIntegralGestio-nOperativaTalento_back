import { RestaurantInventoryService } from './restaurant-inventory.service';

describe('RestaurantInventoryService receipts', () => {
  const service = (prisma: any) => new RestaurantInventoryService(prisma);

  it('calculates inventory quantity and total cost from purchase units', async () => {
    const prisma = {
      restaurantInventoryUnit: { findFirst: jest.fn()
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1000, decimalPrecision: 3 })
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 2 }) },
      restaurantIngredient: { findFirst: jest.fn().mockResolvedValue({ inventoryUnitId: 'g' }) },
    };
    const result = await (service(prisma) as any).prepareReceiptItems(prisma, 'tenant-1', [{ ingredientId: 'i1', purchaseQuantity: 2, purchaseUnitId: 'kg', conversionFactor: 999, unitCost: 4.5, lotNumber: 'L1' }]);
    expect(result[0]).toMatchObject({ inventoryQuantity: 2000, totalCost: 9, conversionFactor: 1000 });
  });

  it('is idempotent when the receipt is already confirmed', async () => {
    const confirmed = { id: 'r1', status: 'CONFIRMED', items: [] };
    const tx = { restaurantGoodsReceipt: { findFirst: jest.fn().mockResolvedValue(confirmed) } };
    const prisma = { $transaction: jest.fn((callback: any) => callback(tx)) };
    await expect(service(prisma).confirmReceipt('tenant-1', 'user-1', 'r1')).resolves.toBe(confirmed);
    expect(tx.restaurantGoodsReceipt.findFirst).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 'tenant-1' }, include: { items: true } });
  });

  it('does not duplicate work when another transaction claims the draft first', async () => {
    const tx = { restaurantGoodsReceipt: {
      findFirst: jest.fn().mockResolvedValueOnce({ id: 'r1', status: 'DRAFT', items: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'r1', status: 'CONFIRMED', items: [] }),
    } };
    const prisma = { $transaction: jest.fn((callback: any) => callback(tx)) };
    await expect(service(prisma).confirmReceipt('tenant-1', 'user-1', 'r1')).resolves.toMatchObject({ status: 'CONFIRMED' });
    expect(tx.restaurantGoodsReceipt.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not edit a confirmed receipt and keeps the transaction failure intact', async () => {
    const tx = { restaurantGoodsReceipt: { findFirst: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }) } };
    const prisma = { $transaction: jest.fn((callback: any) => callback(tx)) };
    await expect(service(prisma).updateReceipt('tenant-1', 'user-1', 'r1', { notes: 'changed' })).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
    expect((tx as any).restaurantGoodsReceipt.update).toBeUndefined();
  });

  it('propagates transaction errors so no partial receipt can be committed', async () => {
    const failure = new Error('movement failed');
    const prisma = { $transaction: jest.fn().mockRejectedValue(failure) };
    await expect(service(prisma).confirmReceipt('tenant-1', 'user-1', 'r1')).rejects.toBe(failure);
  });
});
