import { RestaurantReportsService } from './restaurant-reports.service';

describe('RestaurantReportsService', () => {
  it('calculates valued stock in the backend', async () => {
    const prisma = { restaurantInventoryBalance: { findMany: jest.fn().mockResolvedValue([{ ingredientId: 'i1', quantityOnHand: 4, averageCost: 2.5 }]) } };
    const service = new RestaurantReportsService(prisma as never);
    await expect(service.report('tenant-1', 'valued-stock', {})).resolves.toMatchObject({ data: [{ value: 10 }] });
  });

  it('escapes spreadsheet formula prefixes during export', async () => {
    const service = new RestaurantReportsService({} as never);
    jest.spyOn(service, 'report').mockResolvedValue([{ name: '=FORMULA()', value: 1 }] as any);
    const result = await service.exportCsv('tenant-1', 'user-1', 'audit', {});
    expect(result.content).toContain("'=FORMULA()");
  });
});
