import { createHash, randomUUID } from 'crypto';

import {
  AtsE2eHarness,
  createAtsE2eHarness,
  seedScopedApplication,
} from './ats-e2e-harness';

describe('ATS E2E - seguridad multiempresa y multisucursal', () => {
  let harness: AtsE2eHarness;
  let localA1: Awaited<ReturnType<typeof seedScopedApplication>>;
  let foreignBranchA2: Awaited<ReturnType<typeof seedScopedApplication>>;
  let foreignTenantB: Awaited<ReturnType<typeof seedScopedApplication>>;
  let foreignInterviewId: string;

  beforeAll(async () => {
    harness = await createAtsE2eHarness();
    await Promise.all([
      harness.login('adminA'),
      harness.login('recruiterA1'),
      harness.login('recruiterA2'),
      harness.login('viewerA1'),
      harness.login('adminB'),
    ]);

    [localA1, foreignBranchA2, foreignTenantB] = await Promise.all([
      seedScopedApplication(harness.prisma, {
        tenantId: harness.tenants.tenantA,
        branchId: harness.branches.branchA1,
        suffix: 'LOCAL-A1',
      }),
      seedScopedApplication(harness.prisma, {
        tenantId: harness.tenants.tenantA,
        branchId: harness.branches.branchA2,
        suffix: 'FOREIGN-A2',
      }),
      seedScopedApplication(harness.prisma, {
        tenantId: harness.tenants.tenantB,
        branchId: harness.branches.branchB1,
        suffix: 'FOREIGN-B1',
      }),
    ]);

    const fileContents = Buffer.from('CV E2E aislado de la sucursal A2');
    await harness.prisma.candidateResumeFile.create({
      data: {
        tenantId: harness.tenants.tenantA,
        candidateId: foreignBranchA2.candidate.id,
        applicationId: foreignBranchA2.application.id,
        version: 1,
        storageKey: `ats/e2e/${randomUUID()}.pdf`,
        originalName: 'cv-confidencial-a2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: fileContents.byteLength,
        sha256: createHash('sha256').update(fileContents).digest('hex'),
        scanStatus: 'CLEAN',
        scanEngine: 'E2E',
        uploadedByType: 'SYSTEM',
        consentGrantedAt: new Date(),
        consentVersion: 'e2e-v1',
        retainUntil: new Date(Date.now() + 86_400_000),
      },
    });
    const foreignInterview = await harness.prisma.applicationInterview.create({
      data: {
        tenantId: harness.tenants.tenantA,
        applicationId: foreignBranchA2.application.id,
        interviewerUserId: harness.identities.recruiterA2.id,
        createdByUserId: harness.identities.recruiterA2.id,
        title: 'Entrevista confidencial de sucursal A2',
        type: 'VIRTUAL',
        timezone: 'America/New_York',
        startsAt: new Date(Date.now() + 2 * 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 60 * 60_000),
      },
    });
    foreignInterviewId = foreignInterview.id;
  });

  afterAll(async () => {
    if (harness) await harness.cleanup();
  });

  it('rechaza solicitudes ATS sin autenticacion', async () => {
    await harness.request().get('/api/applications').expect(401);
    await harness.request().get(`/api/vacancies/${localA1.vacancy.id}`).expect(401);
  });

  it('limita listados y paginacion a la sucursal autorizada', async () => {
    const response = await harness
      .request()
      .get('/api/applications?page=1&pageSize=100')
      .set(harness.headers('recruiterA1'))
      .expect(200);

    const ids = response.body.data.map((application: { id: string }) => application.id);
    expect(ids).toContain(localA1.application.id);
    expect(ids).not.toContain(foreignBranchA2.application.id);
    expect(ids).not.toContain(foreignTenantB.application.id);
    expect(response.body.meta.total).toBe(1);
  });

  it('mantiene la analitica ATS dentro de la sucursal aunque se solicite alcance empresa', async () => {
    const response = await harness
      .request()
      .get('/api/reports/ats-analytics?scope=tenant&from=2026-01-01&to=2026-12-31')
      .set(harness.headers('recruiterA1'))
      .expect(200);

    expect(response.body.scope).toMatchObject({
      type: 'BRANCH',
      tenantId: harness.tenants.tenantA,
      branchId: harness.branches.branchA1,
    });
    expect(response.body.summary.applications).toBe(1);
  });

  it('oculta dimensiones analiticas pertenecientes a otra sucursal', async () => {
    await harness
      .request()
      .get(`/api/reports/ats-analytics?vacancyId=${foreignBranchA2.vacancy.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('impide suplantar otra empresa mediante x-tenant-id', async () => {
    await harness
      .request()
      .get('/api/applications')
      .set(
        harness.headers('recruiterA1', {
          tenantId: harness.tenants.tenantB,
          branchId: harness.branches.branchB1,
        }),
      )
      .expect(403);
  });

  it('impide cambiar a una sucursal no asignada mediante x-branch-id', async () => {
    await harness
      .request()
      .get('/api/applications/branch')
      .set(
        harness.headers('recruiterA1', {
          branchId: harness.branches.branchA2,
        }),
      )
      .expect(403);
  });

  it('evita acceso directo por ID a postulaciones de otra sucursal o empresa', async () => {
    await harness
      .request()
      .get(`/api/applications/${foreignBranchA2.application.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);

    await harness
      .request()
      .get(`/api/applications/${foreignTenantB.application.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('evita acceso directo por ID a vacantes ajenas', async () => {
    await harness
      .request()
      .get(`/api/vacancies/${foreignBranchA2.vacancy.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);

    await harness
      .request()
      .get(`/api/vacancies/${foreignTenantB.vacancy.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('oculta sucursales ajenas en filtros de exportacion', async () => {
    await harness
      .request()
      .get(`/api/applications/export?branchId=${harness.branches.branchA2}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('aplica permisos de solo lectura al intentar cambiar una etapa', async () => {
    await harness
      .request()
      .patch(`/api/applications/${localA1.application.id}/status`)
      .set(harness.headers('viewerA1'))
      .send({ status: 'REVIEWING' })
      .expect(403);
  });

  it('hace atomica la validacion de alcance antes de una operacion masiva', async () => {
    await harness
      .request()
      .patch('/api/applications/bulk/status')
      .set(harness.headers('adminA'))
      .send({
        ids: [localA1.application.id, foreignTenantB.application.id],
        assignedRecruiterId: harness.identities.recruiterA1.id,
      })
      .expect(404);

    const unchanged = await harness.prisma.vacancyApplication.findUniqueOrThrow({
      where: { id: localA1.application.id },
      select: { assignedRecruiterId: true },
    });
    expect(unchanged.assignedRecruiterId).toBeNull();
  });

  it('protege los metadatos y versiones del CV entre sucursales', async () => {
    await harness
      .request()
      .get(`/api/applications/${foreignBranchA2.application.id}/files/resume`)
      .set(harness.headers('recruiterA1'))
      .expect(404);

    await harness
      .request()
      .get(`/api/applications/${foreignBranchA2.application.id}/files/resume/versions`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('protege entrevistas y scorecards de otra sucursal', async () => {
    const interviews = await harness
      .request()
      .get(`/api/recruitment/interviews?applicationId=${foreignBranchA2.application.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(200);
    expect(interviews.body.data).toEqual([]);

    await harness
      .request()
      .get(`/api/recruitment/interviews/${foreignInterviewId}/scorecard-context`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('protege ofertas y comunicaciones de otra sucursal', async () => {
    await harness
      .request()
      .get(`/api/ats/offers/applications/${foreignBranchA2.application.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);

    await harness
      .request()
      .get(`/api/ats/communications/applications/${foreignBranchA2.application.id}/history`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
  });

  it('limita Talent CRM y las fusiones al alcance autorizado', async () => {
    const candidates = await harness
      .request()
      .get('/api/talent-crm/candidates?page=1&pageSize=100')
      .set(harness.headers('recruiterA1'))
      .expect(200);
    const candidateIds = candidates.body.data.map((item: { id: string }) => item.id);
    expect(candidateIds).toContain(localA1.candidate.id);
    expect(candidateIds).not.toContain(foreignBranchA2.candidate.id);
    expect(candidateIds).not.toContain(foreignTenantB.candidate.id);

    await harness
      .request()
      .get(`/api/talent-crm/candidates/${foreignBranchA2.candidate.id}`)
      .set(harness.headers('recruiterA1'))
      .expect(404);
    await harness
      .request()
      .post('/api/talent-crm/duplicates/merge')
      .set(harness.headers('recruiterA1'))
      .send({ sourceCandidateId: localA1.candidate.id, targetCandidateId: foreignBranchA2.candidate.id, reason: 'Intento E2E fuera del alcance autorizado' })
      .expect(404);
    await harness
      .request()
      .post('/api/talent-crm/pools')
      .set(harness.headers('recruiterA1'))
      .send({ name: `Pool indebido ${randomUUID()}`, branchId: harness.branches.branchA2 })
      .expect(404);
  });

  it('confirma que usuarios autorizados conservan acceso a su propio alcance', async () => {
    await harness
      .request()
      .get(`/api/applications/${foreignBranchA2.application.id}`)
      .set(harness.headers('recruiterA2'))
      .expect(200);

    await harness
      .request()
      .get(`/api/applications/${foreignTenantB.application.id}`)
      .set(harness.headers('adminB'))
      .expect(200);
  });
});
