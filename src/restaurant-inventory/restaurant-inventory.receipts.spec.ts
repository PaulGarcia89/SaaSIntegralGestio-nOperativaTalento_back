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

  it('runs the receipt confirmation as one economic flow', async () => {
    const receipt = { id: 'r1', tenantId: 'tenant-1', branchId: 'b1', warehouseId: 'w1', receiptNumber: 'REC-1', receivedAt: new Date(), status: 'DRAFT', items: [{ id: 'ri1', ingredientId: 'i1', inventoryQuantity: 10, totalCost: 25, lotNumber: 'LOT-1' }] };
    const tx: any = {
      restaurantGoodsReceipt: {
        findFirst: jest.fn().mockResolvedValue(receipt),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ ...receipt, status: 'CONFIRMED' }),
      },
      restaurantInventoryBalance: {
        findUnique: jest.fn().mockResolvedValue({ quantityOnHand: 5, averageCost: 2 }),
        upsert: jest.fn(),
      },
      restaurantInventoryLot: { upsert: jest.fn().mockResolvedValue({ id: 'lot-1' }) },
      restaurantInventoryMovement: { create: jest.fn() },
      restaurantIngredient: { update: jest.fn() },
      restaurantGoodsReceiptHistory: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: any) => callback(tx)) };

    await service(prisma).confirmReceipt('tenant-1', 'user-1', 'r1');

    expect(tx.restaurantInventoryBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { quantityOnHand: 15, averageCost: (5 * 2 + 25) / 15 },
    }));
    expect(tx.restaurantInventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 10, totalCost: 25, lotId: 'lot-1' }),
    }));
    expect(tx.restaurantIngredient.update).toHaveBeenCalledWith(expect.objectContaining({ data: { currentAverageCost: (5 * 2 + 25) / 15 } }));
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

  it.each([
    ['quantity', { purchaseQuantity: 0, unitCost: 1 }],
    ['cost', { purchaseQuantity: 1, unitCost: -1 }],
  ])('rejects invalid receipt %s', async (_label, values) => {
    const prisma = {
      restaurantInventoryUnit: { findFirst: jest.fn()
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 3 })
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 3 }) },
      restaurantIngredient: { findFirst: jest.fn().mockResolvedValue({ inventoryUnitId: 'g' }) },
    };
    await expect((service(prisma) as any).prepareReceiptItems(prisma, 'tenant-1', [{ ingredientId: 'i1', purchaseUnitId: 'kg', conversionFactor: 1, lotNumber: 'L1', ...values }]))
      .rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
  });

  it('requires a lot when an expiration date is provided and rejects expired lots', async () => {
    const prisma = {
      restaurantInventoryUnit: { findFirst: jest.fn()
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 3 })
        .mockResolvedValueOnce({ type: 'WEIGHT', conversionFactor: 1, decimalPrecision: 3 }) },
      restaurantIngredient: { findFirst: jest.fn().mockResolvedValue({ inventoryUnitId: 'g' }) },
    };
    const base = { ingredientId: 'i1', purchaseQuantity: 1, purchaseUnitId: 'kg', conversionFactor: 1, unitCost: 1 };
    await expect((service(prisma) as any).prepareReceiptItems(prisma, 'tenant-1', [{ ...base, expirationDate: '2099-01-01T00:00:00.000Z' }]))
      .rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
  });
});
