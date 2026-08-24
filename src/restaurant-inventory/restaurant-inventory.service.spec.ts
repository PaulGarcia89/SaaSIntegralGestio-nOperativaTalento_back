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
});
