import { Prisma } from '@prisma/client';
import { RestaurantInventoryService } from './restaurant-inventory.service';

describe('RestaurantInventoryService catalog CRUD', () => {
  const category = { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn() };
  const service = new RestaurantInventoryService({ restaurantInventoryCategory: category } as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns paginated active categories with a tenant-scoped filter', async () => {
    category.findMany.mockResolvedValue([{ id: 'c1', name: 'Salsas' }]);
    category.count.mockResolvedValue(1);
    await expect(service.categories('tenant-1', { search: 'sal', page: 2, pageSize: 10 })).resolves.toEqual({
      data: [{ id: 'c1', name: 'Salsas' }], page: 2, pageSize: 10, total: 1, totalPages: 1,
    });
    expect(category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', status: 'ACTIVE' }), skip: 10, take: 10,
    }));
  });

  it('soft-deletes instead of removing a category', async () => {
    category.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.deleteCategory('tenant-1', 'c1')).resolves.toEqual({ count: 1 });
    expect(category.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', tenantId: 'tenant-1', status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
  });

  it('normalizes unique constraint failures to a domain error', async () => {
    category.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(service.createCategory('tenant-1', { name: 'Salsas' })).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
  });
});
