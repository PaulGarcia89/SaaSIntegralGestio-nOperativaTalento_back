import { randomUUID } from 'crypto';
import request from 'supertest';

import { AtsE2eHarness, createAtsE2eHarness } from './ats-e2e-harness';

describe('ATS E2E - ciclo completo de contratacion', () => {
  let harness: AtsE2eHarness;
  const candidateAccountIds: string[] = [];

  beforeAll(async () => {
    harness = await createAtsE2eHarness();
    await harness.login('adminA');
  });

  afterAll(async () => {
    if (harness) await harness.cleanup(candidateAccountIds);
  });

  it('certifica vacante, postulacion, pipeline, oferta, firma y conversion a empleado', async () => {
    const staffHeaders = harness.headers('adminA');
    const stages = [
      {
        code: 'APPLIED',
        name: 'Postulacion',
        position: 1,
        applicationStatus: 'SUBMITTED',
        allowedNextStageCodes: ['SCREENING'],
      },
      {
        code: 'SCREENING',
        name: 'Revision curricular',
        position: 2,
        applicationStatus: 'REVIEWING',
        allowedNextStageCodes: ['INTERVIEW'],
      },
      {
        code: 'INTERVIEW',
        name: 'Entrevista',
        position: 3,
        applicationStatus: 'INTERVIEW',
        allowedNextStageCodes: ['APPROVED'],
      },
      {
        code: 'APPROVED',
        name: 'Aprobado',
        position: 4,
        applicationStatus: 'APPROVED',
        allowedNextStageCodes: ['HIRED'],
      },
      {
        code: 'HIRED',
        name: 'Contratado',
        position: 5,
        applicationStatus: 'HIRED',
        isTerminal: true,
      },
    ];

    const vacancyResponse = await harness
      .request()
      .post('/api/vacancies')
      .set(staffHeaders)
      .send({
        branchId: harness.branches.branchA1,
        title: 'Especialista E2E de Operaciones',
        summary: 'Vacante de certificacion automatizada',
        description: 'Ejecuta el ciclo ATS completo contra la aplicacion real.',
        openings: 1,
        status: 'OPEN',
        stages,
      })
      .expect(201);

    const vacancy = vacancyResponse.body;
    expect(vacancy.tenantId).toBe(harness.tenants.tenantA);
    expect(vacancy.branchId).toBe(harness.branches.branchA1);
    expect(vacancy.stages).toHaveLength(5);

    const publicDraftClient = request.agent(harness.app.getHttpServer());
    await publicDraftClient
      .put(`/api/public/vacancies/${vacancy.id}/applications/draft`)
      .send({ value: { step: 3, form: { fullName: 'Candidata Integral E2E', email: 'draft@example.test', phone: '+1 555 010 2020', city: 'Miami', dynamicResponses: { disponibilidad: 'Inmediata' } } } })
      .expect(200);
    const restoredDraft = await publicDraftClient
      .get(`/api/public/vacancies/${vacancy.id}/applications/draft`)
      .expect(200);
    expect(restoredDraft.body.value).toMatchObject({ step: 3, form: { email: 'draft@example.test', dynamicResponses: { disponibilidad: 'Inmediata' } } });

    const candidateEmail = `ats.lifecycle.${randomUUID()}@example.test`;
    const candidateName = 'Candidata Integral E2E';
    const registration = await harness
      .request()
      .post('/api/candidate-auth/register')
      .send({ email: candidateEmail, password: 'CandidatePassword123!' })
      .expect(201);

    const candidateToken = registration.body.accessToken as string;
    candidateAccountIds.push(registration.body.candidate.id);
    expect(candidateToken).toBeTruthy();

    await harness
      .request()
      .patch('/api/candidate-auth/profile')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        fullName: candidateName,
        phone: '+1 555 010 2020',
        city: 'Miami',
        locale: 'es',
        statusUpdates: true,
        interviewReminders: true,
        offerNotifications: true,
      })
      .expect(200);

    const applicationResponse = await harness
      .request()
      .post(`/api/public/vacancies/${vacancy.id}/applications`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        fullName: candidateName,
        email: candidateEmail,
        phone: '+1 555 010 2020',
        city: 'Miami',
        coverLetter: 'Postulacion creada por la suite E2E.',
        dynamicResponses: { disponibilidad: 'Inmediata' },
      })
      .expect(201);

    const applicationId = applicationResponse.body.id as string;
    expect(applicationResponse.body.status).toBe('SUBMITTED');
    expect(applicationResponse.body.currentStage.code).toBe('APPLIED');

    const inboxResponse = await harness
      .request()
      .get(`/api/ats/communications/conversations?search=${encodeURIComponent(candidateEmail)}`)
      .set(staffHeaders)
      .expect(200);
    expect(inboxResponse.body.data).toHaveLength(1);
    const conversationId = inboxResponse.body.data[0].id as string;
    await harness
      .request()
      .post(`/api/ats/communications/applications/${applicationId}/messages`)
      .set(staffHeaders)
      .send({ subject: 'Seguimiento E2E de postulación', body: 'Gracias por postular. Revisaremos tu perfil.' })
      .expect(201);
    await harness
      .request()
      .patch(`/api/ats/communications/conversations/${conversationId}`)
      .set(staffHeaders)
      .send({ status: 'PENDING', assignedUserId: harness.identities.adminA.id })
      .expect(200);
    const conversationResponse = await harness
      .request()
      .get(`/api/ats/communications/conversations/${conversationId}`)
      .set(staffHeaders)
      .expect(200);
    expect(conversationResponse.body.status).toBe('PENDING');
    expect(conversationResponse.body.assignedUserId).toBe(harness.identities.adminA.id);
    expect(conversationResponse.body.messages.some((item: { subject: string }) => item.subject === 'Seguimiento E2E de postulación')).toBe(true);

    for (const code of ['SCREENING', 'INTERVIEW']) {
      const stage = vacancy.stages.find((item: { code: string }) => item.code === code);
      const transition = await harness
        .request()
        .patch(`/api/applications/${applicationId}/status`)
        .set(staffHeaders)
        .send({
          currentStageId: stage.id,
          reason: `Avance E2E a ${code}`,
        })
        .expect(200);

      expect(transition.body.currentStage.code).toBe(code);
    }

    const interviewStage = vacancy.stages.find(
      (item: { code: string }) => item.code === 'INTERVIEW',
    );
    const templateResponse = await harness
      .request()
      .post('/api/recruitment/scorecard-templates')
      .set(staffHeaders)
      .send({
        vacancyId: vacancy.id,
        stageId: interviewStage.id,
        name: 'Entrevista estructurada E2E',
        criteria: [
          {
            key: 'RESOLUCION_PROBLEMAS',
            label: 'Resolucion de problemas',
            type: 'RATING',
            weight: 100,
            isRequired: true,
            requiresEvidence: true,
          },
        ],
      })
      .expect(201);

    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const interviewResponse = await harness
      .request()
      .post('/api/recruitment/interviews')
      .set(staffHeaders)
      .send({
        applicationId,
        stageId: interviewStage.id,
        interviewerUserId: harness.identities.adminA.id,
        title: 'Entrevista E2E de competencias',
        type: 'VIRTUAL',
        timezone: 'America/New_York',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        meetingUrl: 'https://meet.example.test/ats-e2e',
      })
      .expect(201);

    const criterion = templateResponse.body.criteria[0];
    const scorecardResponse = await harness
      .request()
      .put(`/api/recruitment/interviews/${interviewResponse.body.id}/scorecard`)
      .set(staffHeaders)
      .send({
        recommendation: 'YES',
        sign: true,
        strengths: 'Evidencia suficiente para continuar.',
        responses: [
          {
            criterionId: criterion.id,
            rating: 4,
            evidence: 'Resuelve el caso con un enfoque estructurado.',
          },
        ],
      })
      .expect(200);
    expect(scorecardResponse.body.status).toBe('SIGNED');
    expect(Number(scorecardResponse.body.weightedScore)).toBe(80);

    const approvedStage = vacancy.stages.find(
      (item: { code: string }) => item.code === 'APPROVED',
    );
    await harness
      .request()
      .patch(`/api/applications/${applicationId}/status`)
      .set(staffHeaders)
      .send({ currentStageId: approvedStage.id, reason: 'Scorecard E2E favorable' })
      .expect(200);

    const approvedApplication = await harness
      .request()
      .get(`/api/applications/${applicationId}`)
      .set(staffHeaders)
      .expect(200);

    expect(approvedApplication.body.status).toBe('APPROVED');
    const stageEvents = approvedApplication.body.tracking.timelineEvents.filter(
      (event: { type: string }) => event.type === 'STAGE_CHANGED',
    );
    expect(stageEvents).toHaveLength(3);
    expect(stageEvents.every((event: { actorId?: string }) => event.actorId === harness.identities.adminA.id)).toBe(true);
    expect(stageEvents.every((event: { actorDisplayName?: string }) => Boolean(event.actorDisplayName))).toBe(true);
    expect(stageEvents.every((event: { previousValue?: unknown; newValue?: unknown }) => Boolean(event.previousValue) && Boolean(event.newValue))).toBe(true);

    const talentPool = await harness
      .request()
      .post('/api/talent-crm/pools')
      .set(staffHeaders)
      .send({ name: `Talento E2E ${randomUUID()}`, branchId: harness.branches.branchA1, description: 'Pool creado durante la certificación ATS.' })
      .expect(201);
    const talentTag = await harness
      .request()
      .post('/api/talent-crm/tags')
      .set(staffHeaders)
      .send({ name: `Prioridad E2E ${randomUUID()}`, color: '#2563eb' })
      .expect(201);
    await harness
      .request()
      .post(`/api/talent-crm/pools/${talentPool.body.id}/members`)
      .set(staffHeaders)
      .send({ candidateId: approvedApplication.body.candidate.id })
      .expect(201);
    await harness
      .request()
      .post(`/api/talent-crm/candidates/${approvedApplication.body.candidate.id}/tags`)
      .set(staffHeaders)
      .send({ tagId: talentTag.body.id })
      .expect(201);
    await harness
      .request()
      .post(`/api/talent-crm/candidates/${approvedApplication.body.candidate.id}/activities`)
      .set(staffHeaders)
      .send({ type: 'NOTE', subject: 'Seguimiento E2E', description: 'Perfil validado por la certificación.' })
      .expect(201);
    const crmProfile = await harness
      .request()
      .get(`/api/talent-crm/candidates/${approvedApplication.body.candidate.id}`)
      .set(staffHeaders)
      .expect(200);
    expect(crmProfile.body.pools.map((item: { id: string }) => item.id)).toContain(talentPool.body.id);
    expect(crmProfile.body.tags.map((item: { id: string }) => item.id)).toContain(talentTag.body.id);
    expect(crmProfile.body.talentActivities[0].subject).toBe('Seguimiento E2E');

    const invalidTemplateId = randomUUID();
    await harness
      .request()
      .post('/api/workflows/hiring')
      .set(staffHeaders)
      .send({
        applicationId,
        branchId: harness.branches.branchA1,
        employeeName: candidateName,
        employeeEmail: candidateEmail,
        jobTitle: 'Especialista de Operaciones',
        onboardingTemplateId: invalidTemplateId,
      })
      .expect(400);

    const rolledBackEmployee = await harness.prisma.employee.findFirst({
      where: { tenantId: harness.tenants.tenantA, sourceCandidateId: approvedApplication.body.candidate.id },
    });
    const rolledBackWorkflow = await harness.prisma.hiringFlow.findFirst({
      where: { tenantId: harness.tenants.tenantA, applicationId },
    });
    expect(rolledBackEmployee).toBeNull();
    expect(rolledBackWorkflow).toBeNull();

    const now = Date.now();
    const offerResponse = await harness
      .request()
      .post(`/api/ats/offers/applications/${applicationId}`)
      .set(staffHeaders)
      .send({
        salaryAmount: 72000,
        currency: 'USD',
        periodicity: 'ANNUAL',
        benefits: ['Seguro medico', 'Capacitacion continua'],
        jobTitle: 'Especialista de Operaciones',
        employmentStartDate: new Date(now + 14 * 86_400_000).toISOString(),
        validUntil: new Date(now + 7 * 86_400_000).toISOString(),
        message: 'Nos complace presentar esta oferta laboral.',
        financialApproverId: harness.identities.adminA.id,
        managerialApproverId: harness.identities.adminA.id,
      })
      .expect(201);

    const offerId = offerResponse.body.id as string;
    expect(offerResponse.body.status).toBe('PENDING_APPROVAL');
    expect(offerResponse.body.versions[0].salaryAmount).toBe('72000');

    await harness
      .request()
      .post(`/api/ats/offers/${offerId}/approvals`)
      .set(staffHeaders)
      .send({ type: 'FINANCIAL', approved: true, notes: 'Presupuesto validado E2E.' })
      .expect(201);

    const managerialApproval = await harness
      .request()
      .post(`/api/ats/offers/${offerId}/approvals`)
      .set(staffHeaders)
      .send({ type: 'MANAGERIAL', approved: true, notes: 'Gerencia valida la contratacion.' })
      .expect(201);
    expect(managerialApproval.body.status).toBe('APPROVED');

    const sentOffer = await harness
      .request()
      .post(`/api/ats/offers/${offerId}/send`)
      .set(staffHeaders)
      .expect(201);
    expect(sentOffer.body.status).toBe('SENT');

    const candidateOffers = await harness
      .request()
      .get('/api/candidate/offers')
      .set('Authorization', `Bearer ${candidateToken}`)
      .expect(200);
    expect(candidateOffers.body.map((offer: { id: string }) => offer.id)).toContain(offerId);

    const signingLink = await harness
      .request()
      .post(`/api/candidate/offers/${offerId}/signing-link`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .expect(201);
    const signingToken = new URL(signingLink.body.url).pathname.split('/').pop();
    expect(signingToken).toBeTruthy();

    const signingContext = await harness
      .request()
      .get(`/api/public/signatures/${signingToken}`)
      .expect(200);
    expect(signingContext.body.participant.fullName).toBe(candidateName);

    await harness
      .request()
      .post(`/api/public/signatures/${signingToken}/consent`)
      .set('x-request-id', `ats-e2e-${randomUUID()}`)
      .send({ accepted: true, typedName: candidateName })
      .expect(201);

    const persistedOffer = await harness.prisma.jobOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    expect(persistedOffer.status).toBe('ACCEPTED');
    expect(persistedOffer.conversionWorkflowId).toBeTruthy();
    expect(persistedOffer.conversionError).toBeNull();

    const hiredApplication = await harness
      .request()
      .get(`/api/applications/${applicationId}`)
      .set(staffHeaders)
      .expect(200);
    expect(hiredApplication.body.status).toBe('HIRED');
    expect(hiredApplication.body.currentStage.code).toBe('HIRED');

    const employee = await harness.prisma.employee.findFirst({
      where: {
        tenantId: harness.tenants.tenantA,
        sourceCandidateId: hiredApplication.body.candidate.id,
      },
      include: { onboardingFlows: { include: { tasks: true } } },
    });
    expect(employee).not.toBeNull();
    expect(employee?.onboardingFlows).toHaveLength(1);
    expect(employee?.onboardingFlows[0].tasks.length).toBeGreaterThan(0);
  });
});
