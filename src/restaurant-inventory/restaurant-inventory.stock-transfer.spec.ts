import { RestaurantInventoryService } from './restaurant-inventory.service';

describe('Restaurant inventory counts and transfers', () => {
  it('keeps theoretical count values hidden before approval', async () => {
    const prisma: any = {
      restaurantStockCount: { count: jest.fn().mockResolvedValue(1), create: jest.fn().mockResolvedValue({ id: 'c1', status: 'DRAFT', items: [{ ingredientId: 'i1', systemQuantity: 0, countedQuantity: 4, varianceQuantity: 0, averageCost: 0, varianceValue: 0 }] }) },
    };
    const result = await new RestaurantInventoryService(prisma).createStockCount('t1', 'u1', { branchId: 'b1', warehouseId: 'w1', countedAt: new Date().toISOString(), items: [{ ingredientId: 'i1', countedQuantity: 4 }] });
    expect(result.items[0]).toEqual({ ingredientId: 'i1', countedQuantity: 4 });
    expect(prisma.restaurantStockCount.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [{ ingredientId: 'i1', systemQuantity: 0, countedQuantity: 4, varianceQuantity: 0, averageCost: 0, varianceValue: 0, reason: undefined, notes: undefined }] } }) }));
  });

  it('marks a transfer SENT without changing balances', async () => {
    const tx: any = { restaurantStockTransfer: {
      findFirst: jest.fn().mockResolvedValue({ id: 'tr1', status: 'DRAFT' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'tr1', status: 'SENT' }),
    }, restaurantInventoryBalance: { update: jest.fn() } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    await expect(new RestaurantInventoryService(prisma).sendTransfer('t1', 'u1', 'tr1')).resolves.toMatchObject({ status: 'SENT' });
    expect(tx.restaurantInventoryBalance.update).not.toHaveBeenCalled();
  });

  it('does not process a transfer twice when receive loses the state race', async () => {
    const tx: any = { restaurantStockTransfer: {
      findFirst: jest.fn().mockResolvedValue({ id: 'tr1', status: 'SENT', items: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'tr1', status: 'RECEIVED' }),
    } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    await expect(new RestaurantInventoryService(prisma).receiveTransfer('t1', 'u1', 'tr1')).resolves.toMatchObject({ status: 'RECEIVED' });
    expect(tx.restaurantStockTransfer.updateMany).toHaveBeenCalledTimes(1);
  });
});
