import { BadRequestException } from '@nestjs/common';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { VacanciesService } from './vacancies.service';

describe('VacanciesService', () => {
  const tx = {
    vacancy: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    vacancyStage: { createMany: jest.fn() },
    vacancyResponsible: { createMany: jest.fn() },
  };
  const prisma = {
    branch: { findFirst: jest.fn() },
    user: { count: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const planLimits = { assertCapacity: jest.fn() };
  const service = new VacanciesService(prisma as never, planLimits as never);
  const actor = {
    sub: '0f8fad5b-d9cb-469f-a165-70867728950e',
    tenantId: 'tenant-1',
    roles: ['RECRUITER'],
    role: 'RECRUITER',
    permissions: ['vacancies.create'],
    scope: AccessScope.TENANT,
    allowedTenantIds: ['tenant-1'],
    allowedBranchIds: ['branch-1'],
    isSuperAdmin: false,
  } as JwtPayload;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1' });
    prisma.user.count.mockResolvedValue(1);
    tx.vacancy.create.mockResolvedValue({ id: 'vacancy-1' });
    tx.vacancy.findUniqueOrThrow.mockResolvedValue({
      id: 'vacancy-1',
      stages: [{ code: 'APPLIED', position: 0 }],
      responsibles: [{ userId: actor.sub, role: 'RECRUITER' }],
    });
  });

  it('creates the vacancy, stages and responsibles in one transaction', async () => {
    const result = await service.create('tenant-1', actor, {
      branchId: 'branch-1',
      title: 'Operations coordinator',
      stages: [
        {
          code: 'applied',
          name: 'Postulación',
          position: 0,
          applicationStatus: 'SUBMITTED',
        },
      ],
      responsibles: [{ userId: actor.sub, role: 'RECRUITER' }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.vacancyStage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: 'tenant-1',
          vacancyId: 'vacancy-1',
          code: 'APPLIED',
          position: 0,
          applicationStatus: 'SUBMITTED',
        }),
      ],
    });
    expect(tx.vacancyResponsible.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: 'tenant-1',
          vacancyId: 'vacancy-1',
          userId: actor.sub,
          role: 'RECRUITER',
        }),
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual(expect.objectContaining({ id: 'vacancy-1' }));
  });

  it('rejects duplicated stage codes before creating a vacancy', async () => {
    await expect(
      service.create('tenant-1', actor, {
        branchId: 'branch-1',
        title: 'Operations coordinator',
        stages: [
          { code: 'review', name: 'Review', position: 0 },
          { code: 'REVIEW', name: 'Second review', position: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects responsibles without access to the vacancy branch', async () => {
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.create('tenant-1', actor, {
        branchId: 'branch-1',
        title: 'Operations coordinator',
        responsibles: [{ userId: actor.sub, role: 'RECRUITER' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
