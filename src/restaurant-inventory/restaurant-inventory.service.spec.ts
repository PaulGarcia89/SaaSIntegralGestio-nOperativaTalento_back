import { RestaurantInventoryService } from './restaurant-inventory.service';

describe('RestaurantInventoryService conversions', () => {
  const findFirst = jest.fn();
  const service = new RestaurantInventoryService({ restaurantInventoryUnit: { findFirst } } as never);

  beforeEach(() => jest.clearAllMocks());

  it('converts compatible units using their base factors', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'kg', tenantId: 't1', type: 'WEIGHT', conversionFactor: 1000 })
      .mockResolvedValueOnce({ id: 'g', tenantId: 't1', type: 'WEIGHT', conversionFactor: 1 });
    await expect((service as any).convert(2, 'kg', 'g', 't1')).resolves.toBe(2000);
  });

  it('rejects conversions across incompatible dimensions', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'kg', tenantId: 't1', type: 'WEIGHT', conversionFactor: 1000 })
      .mockResolvedValueOnce({ id: 'l', tenantId: 't1', type: 'VOLUME', conversionFactor: 1000 });
    await expect((service as any).convert(1, 'kg', 'l', 't1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'BAD_REQUEST' }) });
  });

  it('preserves decimal precision when converting fractional quantities', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'kg', tenantId: 't1', type: 'WEIGHT', conversionFactor: 1000 })
      .mockResolvedValueOnce({ id: 'g', tenantId: 't1', type: 'WEIGHT', conversionFactor: 1 });
    await expect((service as any).convert(0.125, 'kg', 'g', 't1')).resolves.toBe(125);
  });
});

describe('RestaurantInventoryService expiry alerts', () => {
  it('calculates severity and excludes depleted lots', async () => {
    const prisma = {
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', branchId: 'b1', status: 'ACTIVE' }) },
      restaurantInventoryLot: { findMany: jest.fn().mockResolvedValue([
        { id: 'expired', tenantId: 't1', branchId: 'b1', warehouseId: 'w1', ingredientId: 'i1', lotNumber: 'L-1', expirationDate: new Date(Date.now() - 86400000), remainingQuantity: 2, unitCost: 3, status: 'ACTIVE', receivedAt: new Date() },
        { id: 'warning', tenantId: 't1', branchId: 'b1', warehouseId: 'w1', ingredientId: 'i1', lotNumber: 'L-2', expirationDate: new Date(Date.now() + 5 * 86400000), remainingQuantity: 4, unitCost: 3, status: 'ACTIVE', receivedAt: new Date() },
      ]) },
      restaurantExpiryAlertAcknowledgement: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', sku: 'TOM', name: 'Tomate', inventoryUnitId: 'u1' }]) },
      restaurantInventoryUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: 'Kilogramo', abbreviation: 'kg' }]) },
    };
    const service = new RestaurantInventoryService(prisma as never);

    const result = await service.expiryAlertList('t1', { branchId: 'b1', warehouseId: 'w1', days: 30 });

    expect(result.map((row) => row.severity)).toEqual(['EXPIRED', 'WARNING']);
    expect(result[0]).toMatchObject({ quantity: 2, unitCost: 3, totalCost: 6, ingredient: { name: 'Tomate' }, unit: { abbreviation: 'kg' } });
    expect(prisma.restaurantInventoryLot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', branchId: 'b1', warehouseId: 'w1', status: 'ACTIVE', remainingQuantity: { gt: 0 } }) }));
  });

  it('applies severity and acknowledgement status filters without crossing tenants', async () => {
    const prisma = {
      restaurantInventoryLot: { findMany: jest.fn().mockResolvedValue([{ id: 'lot-1', tenantId: 'tenant-a', branchId: 'b1', warehouseId: 'w1', ingredientId: 'i1', lotNumber: 'L-1', expirationDate: new Date(Date.now() + 2 * 86400000), remainingQuantity: 1, unitCost: 1, status: 'ACTIVE', receivedAt: new Date() }]) },
      restaurantExpiryAlertAcknowledgement: { findMany: jest.fn().mockResolvedValue([{ lotId: 'lot-1', acknowledgedBy: 'user-1', acknowledgedAt: new Date() }]), upsert: jest.fn() },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', sku: 'SKU', name: 'Ingrediente', inventoryUnitId: 'u1' }]) },
      restaurantInventoryUnit: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RestaurantInventoryService(prisma as never);

    const result = await service.expiryAlertList('tenant-a', { severity: 'CRITICAL', status: 'ACKNOWLEDGED', ingredientId: 'i1' });

    expect(result).toHaveLength(1);
    expect(prisma.restaurantInventoryLot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', ingredientId: 'i1' }) }));
  });

  it('acknowledges a lot idempotently', async () => {
    const ack = { id: 'ack-1', tenantId: 't1', lotId: 'lot-1', acknowledgedBy: 'user-1', acknowledgedAt: new Date() };
    const prisma = { restaurantInventoryLot: { findFirst: jest.fn().mockResolvedValue({ id: 'lot-1', tenantId: 't1', status: 'ACTIVE', remainingQuantity: 2, expirationDate: new Date() }) }, restaurantExpiryAlertAcknowledgement: { upsert: jest.fn().mockResolvedValue(ack) } };
    const service = new RestaurantInventoryService(prisma as never);

    await expect(service.acknowledgeExpiryAlert('t1', 'user-1', 'lot-1')).resolves.toEqual(ack);
    await expect(service.acknowledgeExpiryAlert('t1', 'user-1', 'lot-1')).resolves.toEqual(ack);
    expect(prisma.restaurantExpiryAlertAcknowledgement.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.restaurantExpiryAlertAcknowledgement.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId_lotId: { tenantId: 't1', lotId: 'lot-1' } }, update: {} }));
  });
});

describe('RestaurantInventoryService stock count schedules', () => {
  it('creates a weekly partial schedule and rejects duplicate scope', async () => {
    const prisma = {
      restaurantInventoryWarehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', branchId: 'b1', status: 'ACTIVE' }) },
      restaurantInventoryCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', status: 'ACTIVE' }) },
      restaurantStockCountSchedule: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ scope: { categoryId: 'c1' } }]), create: jest.fn().mockResolvedValue({ id: 'schedule-1' }) },
    };
    const service = new RestaurantInventoryService(prisma as never);
    const dto: any = { branchId: 'b1', warehouseId: 'w1', recurrence: 'WEEKLY', nextRunAt: new Date(Date.now() + 86400000).toISOString(), scope: { categoryId: 'c1' } };

    await expect(service.createStockCountSchedule('t1', 'u1', dto)).resolves.toMatchObject({ id: 'schedule-1' });
    await expect(service.createStockCountSchedule('t1', 'u1', dto)).rejects.toMatchObject({ response: expect.objectContaining({ status: 409 }) });
  });

  it('materializes due schedules once and advances recurrence', async () => {
    const due = { id: 'schedule-1', tenantId: 't1', branchId: 'b1', warehouseId: 'w1', recurrence: 'DAILY', nextRunAt: new Date('2026-08-25T00:00:00.000Z'), scope: { ingredientId: 'i1' }, createdBy: 'u1' };
    const prisma = {
      restaurantStockCountSchedule: { findMany: jest.fn().mockResolvedValue([due]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1' }]) },
      restaurantStockCount: { create: jest.fn().mockResolvedValue({ id: 'count-1' }) },
    };
    const service = new RestaurantInventoryService(prisma as never);

    await expect(service.materializeDueStockCountSchedules(new Date('2026-08-25T01:00:00.000Z'))).resolves.toEqual({ created: 1 });
    expect(prisma.restaurantStockCountSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE', nextRunAt: due.nextRunAt }), data: expect.objectContaining({ lastRunAt: due.nextRunAt }) }));
    expect(prisma.restaurantStockCount.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'SCHEDULED', scope: due.scope, scheduleId: 'schedule-1', items: expect.objectContaining({ create: [{ ingredientId: 'i1', systemQuantity: 0, countedQuantity: 0, varianceQuantity: 0, averageCost: 0, varianceValue: 0 }] }) }) }));
  });

  it('pauses and resumes only the expected state', async () => {
    const prisma = { restaurantStockCountSchedule: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ id: 'schedule-1' }) } };
    const service = new RestaurantInventoryService(prisma as never);
    await service.pauseStockCountSchedule('t1', 'u1', 'schedule-1');
    await service.resumeStockCountSchedule('t1', 'u1', 'schedule-1');
    expect(prisma.restaurantStockCountSchedule.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'schedule-1', tenantId: 't1', status: 'ACTIVE' } }));
    expect(prisma.restaurantStockCountSchedule.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: 'schedule-1', tenantId: 't1', status: 'PAUSED' } }));
  });
});

describe('RestaurantInventoryService shrinkage alerts', () => {
  it('creates an alert only when percentage or monetary threshold is exceeded', async () => {
    const prisma = {
      restaurantStockCount: { findMany: jest.fn().mockResolvedValue([{ id: 'count-1', branchId: 'b1', warehouseId: 'w1', countedAt: new Date(), items: [{ ingredientId: 'i1', systemQuantity: 100, varianceQuantity: -10, varianceValue: -25, reason: null }] }]) },
      restaurantWasteRecord: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantInventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
      restaurantShrinkageAlert: { upsert: jest.fn().mockResolvedValue({ id: 'alert-1', ingredientId: 'i1', varianceQuantity: -10, varianceValue: -25, variancePercent: 10, status: 'OPEN' }), findMany: jest.fn().mockResolvedValue([{ id: 'alert-1', ingredientId: 'i1', varianceQuantity: -10, varianceValue: -25, variancePercent: 10, status: 'OPEN', sourceType: 'COUNT_VARIANCE' }]) },
      restaurantIngredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', name: 'Tomate', sku: 'TOM' }]) },
    };
    const service = new RestaurantInventoryService(prisma as never);

    const result = await service.shrinkageAlerts('t1', { thresholdPercent: 5, thresholdValue: 20 });

    expect(prisma.restaurantShrinkageAlert.upsert).toHaveBeenCalledTimes(1);
    expect(result.alerts[0]).toMatchObject({ ingredient: { name: 'Tomate' }, variation: { quantity: -10, percentage: 10, value: -25 } });
  });

  it('keeps alert state transitions idempotent and requires a resolution reason', async () => {
    const alert = { id: 'alert-1', tenantId: 't1', status: 'OPEN' };
    const prisma = { restaurantShrinkageAlert: { findFirst: jest.fn().mockResolvedValue(alert), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const service = new RestaurantInventoryService(prisma as never);

    await expect(service.acknowledgeShrinkageAlert('t1', 'u1', 'alert-1')).resolves.toEqual(alert);
    await expect(service.acknowledgeShrinkageAlert('t1', 'u1', 'alert-1')).resolves.toEqual(alert);
    await expect(service.resolveShrinkageAlert('t1', 'u1', 'alert-1', { reason: '' })).rejects.toThrow('motivo');
    expect(prisma.restaurantShrinkageAlert.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'alert-1', tenantId: 't1', status: 'OPEN' } }));
  });
});
