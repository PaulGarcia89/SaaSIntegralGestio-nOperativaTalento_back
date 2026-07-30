import { ConflictException } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';

describe('PlanLimitsService', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    user: { count: jest.fn() },
    branch: { count: jest.fn() },
    vacancy: { count: jest.fn() },
    trainingCourse: { count: jest.fn() },
    inventoryAsset: { count: jest.fn() },
  };
  const service = new PlanLimitsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('allows capacity when usage is below the configured limit', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { name: 'Growth', limits: { maxUsers: 10 } },
    });
    prisma.user.count.mockResolvedValue(9);

    await expect(service.assertCapacity('tenant-1', 'maxUsers')).resolves.toBeUndefined();
  });

  it('rejects a new record when the configured limit was reached', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { name: 'Starter', limits: { maxBranches: 1 } },
    });
    prisma.branch.count.mockResolvedValue(1);

    await expect(service.assertCapacity('tenant-1', 'maxBranches')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('treats null limits as unlimited', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: { name: 'Enterprise', limits: { maxAssets: null } },
    });

    await expect(service.assertCapacity('tenant-1', 'maxAssets')).resolves.toBeUndefined();
    expect(prisma.inventoryAsset.count).not.toHaveBeenCalled();
  });
});
