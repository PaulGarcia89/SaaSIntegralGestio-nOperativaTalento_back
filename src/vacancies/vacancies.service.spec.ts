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
    vacancyLocation: { createMany: jest.fn() },
    vacancyChangeEvent: { create: jest.fn() },
    careerPortal: { findFirst: jest.fn() },
    jobPublication: { upsert: jest.fn() },
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
    tx.vacancy.create.mockResolvedValue({ id: 'vacancy-1', title: 'Operations coordinator', status: 'OPEN' });
    tx.careerPortal.findFirst.mockResolvedValue({ id: 'marketplace-1' });
    tx.jobPublication.upsert.mockResolvedValue({});
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
    expect(tx.vacancyLocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: 'tenant-1',
          vacancyId: 'vacancy-1',
          branchId: 'branch-1',
          isPrimary: true,
        }),
      ],
    });
    expect(tx.vacancyChangeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vacancyId: 'vacancy-1',
        actorUserId: actor.sub,
        type: 'CREATED',
      }),
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

describe('VacanciesService · publicación en el mercado público', () => {
  // La migración 20260826120000 creó una publicación para cada vacante
  // abierta que existía entonces, pero nada la creaba después: toda vacante
  // abierta desde la aplicación quedaba invisible en el portal público y nadie
  // podía postularse. Estas pruebas fijan que crear y cambiar de estado
  // mantienen la publicación al día, con la misma forma que la del backfill.
  function armar() {
    const tx = {
      vacancy: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      vacancyStage: { createMany: jest.fn(), deleteMany: jest.fn() },
      vacancyResponsible: { createMany: jest.fn(), deleteMany: jest.fn() },
      vacancyLocation: { createMany: jest.fn(), deleteMany: jest.fn() },
      vacancyChangeEvent: { create: jest.fn() },
      careerPortal: { findFirst: jest.fn().mockResolvedValue({ id: 'marketplace-1' }) },
      jobPublication: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      user: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new VacanciesService(prisma as never, { assertCapacity: jest.fn() } as never);
    return { tx, prisma, service };
  }
  const actor = {
    sub: '0f8fad5b-d9cb-469f-a165-70867728950e', tenantId: 'tenant-1', roles: ['RECRUITER'], role: 'RECRUITER',
    permissions: ['vacancies.create'], scope: AccessScope.TENANT, allowedTenantIds: ['tenant-1'], allowedBranchIds: ['branch-1'], isSuperAdmin: false,
  } as JwtPayload;

  it('una vacante abierta se publica en el mercado con la misma forma que el backfill', async () => {
    const { tx, service } = armar();
    tx.vacancy.create.mockResolvedValue({ id: 'vacancy-1', title: 'Cocinero', status: 'OPEN' });
    tx.vacancy.findUniqueOrThrow.mockResolvedValue({ id: 'vacancy-1', stages: [], responsibles: [] });

    await service.create('tenant-1', actor, { branchId: 'branch-1', title: 'Cocinero', status: 'OPEN' } as never);

    expect(tx.jobPublication.upsert).toHaveBeenCalledTimes(1);
    const llamada = tx.jobPublication.upsert.mock.calls[0][0];
    expect(llamada.where).toEqual({ vacancyId_channel_portalId: { vacancyId: 'vacancy-1', channel: 'PUBLIC_MARKETPLACE', portalId: 'marketplace-1' } });
    expect(llamada.create).toEqual(expect.objectContaining({ tenantId: 'tenant-1', vacancyId: 'vacancy-1', portalId: 'marketplace-1', channel: 'PUBLIC_MARKETPLACE', status: 'PUBLISHED', publicSlug: 'vacancy-1' }));
    expect(llamada.create.publishedAt).toBeInstanceOf(Date);
  });

  it('una vacante creada en pausa queda con la publicación en pausa, no publicada', async () => {
    const { tx, service } = armar();
    tx.vacancy.create.mockResolvedValue({ id: 'vacancy-2', title: 'Mesero', status: 'PAUSED' });
    tx.vacancy.findUniqueOrThrow.mockResolvedValue({ id: 'vacancy-2', stages: [], responsibles: [] });

    await service.create('tenant-1', actor, { branchId: 'branch-1', title: 'Mesero', status: 'PAUSED' } as never);

    expect(tx.jobPublication.upsert.mock.calls[0][0].create.status).toBe('PAUSED');
    expect(tx.jobPublication.upsert.mock.calls[0][0].create.publishedAt).toBeNull();
  });

  it('sin portal «marketplace» no inventa ninguna publicación', async () => {
    const { tx, service } = armar();
    tx.careerPortal.findFirst.mockResolvedValue(null);
    tx.vacancy.create.mockResolvedValue({ id: 'vacancy-3', title: 'Barista', status: 'OPEN' });
    tx.vacancy.findUniqueOrThrow.mockResolvedValue({ id: 'vacancy-3', stages: [], responsibles: [] });

    await service.create('tenant-1', actor, { branchId: 'branch-1', title: 'Barista', status: 'OPEN' } as never);

    expect(tx.jobPublication.upsert).not.toHaveBeenCalled();
  });
});
