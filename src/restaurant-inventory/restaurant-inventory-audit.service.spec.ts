import { RestaurantInventoryAuditService } from './restaurant-inventory-audit.service';

describe('RestaurantInventoryAuditService', () => {
  it('lists only the authenticated tenant with filters and pagination', async () => {
    const prisma = {
      restaurantInventoryAuditLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1', tenantId: 'tenant-a', hash: 'h1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new RestaurantInventoryAuditService(prisma as never);

    await expect(service.list('tenant-a', { actorId: 'user-1', action: 'RECEIPT_CONFIRMED', page: 2, pageSize: 10 })).resolves.toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(prisma.restaurantInventoryAuditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', actorId: 'user-1', action: 'RECEIPT_CONFIRMED' }, skip: 10, take: 10 }));
  });

  it('does not expose mutation operations for append-only audit records', () => {
    const service = new RestaurantInventoryAuditService({} as never);
    expect((service as any).update).toBeUndefined();
    expect((service as any).remove).toBeUndefined();
  });
});
