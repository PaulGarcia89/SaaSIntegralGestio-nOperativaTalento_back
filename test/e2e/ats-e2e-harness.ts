import 'dotenv/config';

import { randomUUID } from 'crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccessScope,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

const TEST_PASSWORD = 'AtsE2ePassword123!';

const MANAGER_PERMISSIONS = [
  'branch.switch',
  'vacancies.read',
  'vacancies.create',
  'vacancies.update',
  'applications.read',
  'applications.update',
  'applications.export',
  'applications.bulk_update',
  'applications.files.read',
];

const VIEWER_PERMISSIONS = [
  'vacancies.read',
  'applications.read',
  'applications.files.read',
];

type IdentityKey =
  | 'adminA'
  | 'recruiterA1'
  | 'recruiterA2'
  | 'viewerA1'
  | 'adminB';

interface Identity {
  id: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  branchId: string;
  accessToken?: string;
}

export interface AtsE2eHarness {
  app: INestApplication;
  prisma: PrismaService;
  request: () => ReturnType<typeof request>;
  identities: Record<IdentityKey, Identity>;
  tenants: {
    tenantA: string;
    tenantB: string;
  };
  branches: {
    branchA1: string;
    branchA2: string;
    branchB1: string;
  };
  login: (identity: IdentityKey) => Promise<string>;
  headers: (
    identity: IdentityKey,
    overrides?: { tenantId?: string; branchId?: string },
  ) => Record<string, string>;
  cleanup: (candidateAccountIds?: string[]) => Promise<void>;
}

function configureTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET ||= 'ats-e2e-access-secret';
  process.env.JWT_REFRESH_SECRET ||= 'ats-e2e-refresh-secret';
  process.env.WEBHOOK_SECRET ||= 'ats-e2e-webhook-secret';
  process.env.SCORM_LAUNCH_SECRET ||= 'ats-e2e-scorm-secret';
  process.env.MESSAGING_ENABLED = 'false';
  process.env.NOTIFICATION_DELIVERY_WORKER_ENABLED = 'false';
  process.env.ATS_SLA_WORKER_ENABLED = 'false';
  process.env.OUTBOX_DISPATCHER_ENABLED = 'false';
  process.env.PUBLIC_FRONTEND_URL = 'http://localhost:3000';
  process.env.ATS_FILE_STORAGE_DRIVER = 'local';
  process.env.ATS_FILE_STORAGE_ROOT ||= '/tmp/talentos-ats-e2e';
}

function assertSafeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio para ejecutar la suite E2E.');
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '').toLowerCase();
  if (!/(e2e|test|certification)/.test(databaseName)) {
    throw new Error(
      `La suite E2E se rehusa a usar la base de datos "${databaseName}". ` +
        'Utiliza una base cuyo nombre contenga e2e, test o certification.',
    );
  }
}

async function permissionIds(prisma: PrismaClient, codes: string[]) {
  const permissions = await prisma.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });

  const found = new Set(permissions.map((permission) => permission.code));
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Faltan permisos globales. Ejecuta el seed antes del E2E: ${missing.join(', ')}`,
    );
  }

  return permissions.map((permission) => permission.id);
}

export async function createAtsE2eHarness(): Promise<AtsE2eHarness> {
  configureTestEnvironment();
  assertSafeDatabase();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  const suffix = randomUUID().slice(0, 8);
  const plan = await prisma.plan.findFirst({
    where: { planModules: { some: { module: { code: 'ATS' } } } },
    select: { id: true },
  });

  if (!plan) {
    await app.close();
    throw new Error('No existe un plan activo con ATS. Ejecuta prisma/seed.ts primero.');
  }

  const managerPermissionIds = await permissionIds(prisma, MANAGER_PERMISSIONS);
  const viewerPermissionIds = await permissionIds(prisma, VIEWER_PERMISSIONS);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);

  const tenantA = await prisma.tenant.create({
    data: {
      name: `ATS E2E Empresa A ${suffix}`,
      slug: `ats-e2e-a-${suffix}`,
      subscription: {
        create: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(),
        },
      },
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      name: `ATS E2E Empresa B ${suffix}`,
      slug: `ats-e2e-b-${suffix}`,
      subscription: {
        create: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(),
        },
      },
    },
  });

  const [branchA1, branchA2, branchB1] = await Promise.all([
    prisma.branch.create({
      data: { tenantId: tenantA.id, name: 'Sucursal A1', location: 'Miami' },
    }),
    prisma.branch.create({
      data: { tenantId: tenantA.id, name: 'Sucursal A2', location: 'Orlando' },
    }),
    prisma.branch.create({
      data: { tenantId: tenantB.id, name: 'Sucursal B1', location: 'Tampa' },
    }),
  ]);

  const createRole = async (
    tenantId: string,
    name: string,
    code: string,
    ids: string[],
    scope: AccessScope,
  ) =>
    prisma.role.create({
      data: {
        tenantId,
        name,
        code,
        scope,
        isSystem: false,
        rolePermissions: {
          create: ids.map((permissionId) => ({ permissionId })),
        },
      },
    });

  const [adminRoleA, managerRoleA, viewerRoleA, adminRoleB] = await Promise.all([
    createRole(tenantA.id, 'Administrador E2E', 'TENANT_ADMIN', managerPermissionIds, AccessScope.TENANT),
    createRole(tenantA.id, 'Reclutador E2E', 'HR_MANAGER', managerPermissionIds, AccessScope.BRANCH),
    createRole(tenantA.id, 'Consulta E2E', 'BRANCH_USER', viewerPermissionIds, AccessScope.BRANCH),
    createRole(tenantB.id, 'Administrador E2E', 'TENANT_ADMIN', managerPermissionIds, AccessScope.TENANT),
  ]);

  const createUser = async (params: {
    tenantId: string;
    branchId: string;
    roleId: string;
    emailPrefix: string;
    firstName: string;
    lastName: string;
  }) =>
    prisma.user.create({
      data: {
        tenantId: params.tenantId,
        activeBranchId: params.branchId,
        email: `${params.emailPrefix}.${suffix}@example.test`,
        firstName: params.firstName,
        lastName: params.lastName,
        passwordHash,
        userRoles: { create: { roleId: params.roleId } },
        branchAccesses: { create: { branchId: params.branchId } },
      },
    });

  const [adminA, recruiterA1, recruiterA2, viewerA1, adminB] = await Promise.all([
    createUser({
      tenantId: tenantA.id,
      branchId: branchA1.id,
      roleId: adminRoleA.id,
      emailPrefix: 'admin-a',
      firstName: 'Administrador',
      lastName: 'Empresa A',
    }),
    createUser({
      tenantId: tenantA.id,
      branchId: branchA1.id,
      roleId: managerRoleA.id,
      emailPrefix: 'recruiter-a1',
      firstName: 'Reclutador',
      lastName: 'Sucursal A1',
    }),
    createUser({
      tenantId: tenantA.id,
      branchId: branchA2.id,
      roleId: managerRoleA.id,
      emailPrefix: 'recruiter-a2',
      firstName: 'Reclutador',
      lastName: 'Sucursal A2',
    }),
    createUser({
      tenantId: tenantA.id,
      branchId: branchA1.id,
      roleId: viewerRoleA.id,
      emailPrefix: 'viewer-a1',
      firstName: 'Consulta',
      lastName: 'Sucursal A1',
    }),
    createUser({
      tenantId: tenantB.id,
      branchId: branchB1.id,
      roleId: adminRoleB.id,
      emailPrefix: 'admin-b',
      firstName: 'Administrador',
      lastName: 'Empresa B',
    }),
  ]);

  const identities: Record<IdentityKey, Identity> = {
    adminA: {
      id: adminA.id,
      email: adminA.email,
      tenantId: tenantA.id,
      tenantSlug: tenantA.slug,
      branchId: branchA1.id,
    },
    recruiterA1: {
      id: recruiterA1.id,
      email: recruiterA1.email,
      tenantId: tenantA.id,
      tenantSlug: tenantA.slug,
      branchId: branchA1.id,
    },
    recruiterA2: {
      id: recruiterA2.id,
      email: recruiterA2.email,
      tenantId: tenantA.id,
      tenantSlug: tenantA.slug,
      branchId: branchA2.id,
    },
    viewerA1: {
      id: viewerA1.id,
      email: viewerA1.email,
      tenantId: tenantA.id,
      tenantSlug: tenantA.slug,
      branchId: branchA1.id,
    },
    adminB: {
      id: adminB.id,
      email: adminB.email,
      tenantId: tenantB.id,
      tenantSlug: tenantB.slug,
      branchId: branchB1.id,
    },
  };

  const login = async (identityKey: IdentityKey) => {
    const identity = identities[identityKey];
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: identity.email,
        password: TEST_PASSWORD,
        tenantSlug: identity.tenantSlug,
      })
      .expect(201);

    identity.accessToken = response.body.accessToken;
    return identity.accessToken as string;
  };

  const headers = (
    identityKey: IdentityKey,
    overrides?: { tenantId?: string; branchId?: string },
  ) => {
    const identity = identities[identityKey];
    if (!identity.accessToken) {
      throw new Error(`La identidad ${identityKey} debe iniciar sesion primero.`);
    }

    return {
      Authorization: `Bearer ${identity.accessToken}`,
      'x-tenant-id': overrides?.tenantId ?? identity.tenantId,
      'x-branch-id': overrides?.branchId ?? identity.branchId,
    };
  };

  const cleanup = async (_candidateAccountIds: string[] = []) => {
    // La base E2E completa se descarta fuera del proceso; cerrar Nest evita
    // borrar relaciones auditables con onDelete Restrict durante la asercion.
    await app.close();
  };

  return {
    app,
    prisma,
    request: () => request(app.getHttpServer()),
    identities,
    tenants: { tenantA: tenantA.id, tenantB: tenantB.id },
    branches: {
      branchA1: branchA1.id,
      branchA2: branchA2.id,
      branchB1: branchB1.id,
    },
    login,
    headers,
    cleanup,
  };
}

export async function seedScopedApplication(
  prisma: PrismaClient,
  params: { tenantId: string; branchId: string; suffix: string },
) {
  const vacancy = await prisma.vacancy.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      title: `Vacante ${params.suffix}`,
      description: 'Vacante controlada para pruebas E2E de aislamiento.',
      status: 'OPEN',
      openings: 1,
      locations: {
        create: { tenantId: params.tenantId, branchId: params.branchId, isPrimary: true },
      },
      stages: {
        create: {
          name: 'Postulacion',
          code: `APPLIED-${params.suffix}`,
          position: 1,
          applicationStatus: 'SUBMITTED',
          tenantId: params.tenantId,
        },
      },
    },
    include: { stages: true },
  });

  const candidate = await prisma.candidate.create({
    data: {
      tenantId: params.tenantId,
      fullName: `Candidato ${params.suffix}`,
      email: `candidate.${params.suffix}.${randomUUID()}@example.test`,
    },
  });

  const application = await prisma.vacancyApplication.create({
    data: {
      tenantId: params.tenantId,
      vacancyId: vacancy.id,
      candidateId: candidate.id,
      currentStageId: vacancy.stages[0].id,
      status: 'SUBMITTED',
    },
  });

  return { vacancy, candidate, application };
}
