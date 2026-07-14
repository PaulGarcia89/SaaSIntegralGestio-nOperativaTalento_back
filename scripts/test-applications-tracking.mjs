import assert from 'node:assert/strict';

const apiBaseUrl = process.env.TEST_API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const loginPayload = {
  email: process.env.TEST_SUPERADMIN_EMAIL ?? 'superadmin@saasintegral.com',
  password: process.env.TEST_SUPERADMIN_PASSWORD ?? 'ChangeMe123!',
  tenantSlug: process.env.TEST_SUPERADMIN_TENANT_SLUG ?? 'platform',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  return { response, data };
}

function buildAuthHeaders(accessToken, tenantId, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-tenant-id': tenantId,
    ...extra,
  };
}

function assertTimelineHasNoDuplicates(timelineEvents) {
  const types = timelineEvents.map((event) => event.type);
  assert.equal(new Set(types).size, types.length, 'timeline must not contain duplicate event types');
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginPayload),
  });

  assert.equal(login.response.status, 201, 'login should succeed');
  assert.ok(login.data?.accessToken, 'login must return access token');
  assert.ok(login.data?.user?.tenantId, 'login must return tenant id');

  const accessToken = login.data.accessToken;
  const tenantId = login.data.user.tenantId;
  const branchId = login.data.user.activeBranchId;

  const list = await request('/applications?page=1&pageSize=25', {
    headers: buildAuthHeaders(accessToken, tenantId),
  });

  assert.equal(list.response.status, 200, 'tenant applications list should succeed');
  assert.ok(Array.isArray(list.data?.data), 'applications list must return data array');

  const application = list.data.data[0];
  assert.ok(application, 'at least one application is required to validate tracking flow');

  const patchPayload = {
    status: 'INTERVIEW',
    notes: 'Seguimiento validado desde test automatizado',
    interview: {
      type: 'VIRTUAL',
      scheduledAt: '2026-06-02T14:00:00.000Z',
      followUpAt: '2026-06-03T14:00:00.000Z',
      observations: 'Primera entrevista técnica',
    },
    tracking: {
      contactedAt: '2026-06-01T13:00:00.000Z',
      interviewCompletedAt: '2026-06-02T15:00:00.000Z',
      timelineEvents: [
        { type: 'CONTACTED', at: '2026-06-01T13:00:00.000Z', note: 'WhatsApp enviado' },
        { type: 'INTERVIEW_SCHEDULED', at: '2026-06-02T14:00:00.000Z', note: 'Invite calendar' },
        { type: 'INTERVIEW_COMPLETED', at: '2026-06-02T15:00:00.000Z', note: 'Entrevista completada' },
      ],
    },
  };

  const patch = await request(`/applications/${application.id}/status`, {
    method: 'PATCH',
    headers: buildAuthHeaders(accessToken, tenantId, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(patchPayload),
  });

  assert.equal(patch.response.status, 200, 'application patch should succeed');
  assert.equal(patch.data.status, 'INTERVIEW');
  assert.equal(patch.data.notes, patchPayload.notes);
  assert.equal(patch.data.interview?.type, patchPayload.interview.type);
  assert.equal(patch.data.tracking?.contactedAt, patchPayload.tracking.contactedAt);
  assert.equal(
    patch.data.tracking?.interviewCompletedAt,
    patchPayload.tracking.interviewCompletedAt,
  );
  assertTimelineHasNoDuplicates(patch.data.tracking?.timelineEvents ?? []);

  const branchFromJwt = await request('/applications/branch?page=1&pageSize=1', {
    headers: buildAuthHeaders(accessToken, tenantId),
  });
  assert.equal(
    branchFromJwt.response.status,
    200,
    'branch endpoint should resolve branch context from JWT when available',
  );

  const branchList = await request('/applications/branch?page=1&pageSize=25', {
    headers: buildAuthHeaders(accessToken, tenantId, {
      'x-branch-id': branchId,
    }),
  });
  assert.equal(branchList.response.status, 200, 'branch applications list should succeed with branch context');

  const invalidEnum = await request(`/applications/${application.id}/status`, {
    method: 'PATCH',
    headers: buildAuthHeaders(accessToken, tenantId, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      status: 'INVALID_STATUS',
      interview: patchPayload.interview,
    }),
  });
  assert.equal(invalidEnum.response.status, 400, 'invalid status enum must fail');

  const invalidDate = await request(`/applications/${application.id}/status`, {
    method: 'PATCH',
    headers: buildAuthHeaders(accessToken, tenantId, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      status: 'INTERVIEW',
      interview: {
        ...patchPayload.interview,
        scheduledAt: 'not-a-date',
      },
    }),
  });
  assert.equal(invalidDate.response.status, 400, 'invalid interview date must fail');

  const legacyCandidate = list.data.data.find(
    (item) => item.interview === null && (item.tracking === null || item.tracking.timelineEvents?.length === 0),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: {
          tenantList: list.data.data.length,
          patchedApplicationId: application.id,
          branchList: branchList.data?.data?.length ?? 0,
          legacySampleFound: Boolean(legacyCandidate),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
