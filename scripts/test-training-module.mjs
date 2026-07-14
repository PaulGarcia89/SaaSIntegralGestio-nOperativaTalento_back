const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const email = process.env.SUPERADMIN_EMAIL ?? 'superadmin@saasintegral.com';
const password = process.env.SUPERADMIN_PASSWORD ?? 'ChangeMe123!';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return data;
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const token = login.accessToken;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const moduleAccess = await request('/training/module-access', { headers });
  const overview = await request('/training/overview', { headers });
  const catalog = await request('/training/catalog?page=1&pageSize=2', { headers });
  const certificates = await request('/training/certificates', { headers });

  if (!moduleAccess.enabled) {
    throw new Error('Expected training module to be enabled');
  }

  if (!Array.isArray(overview.inProgressAssignments)) {
    throw new Error('Overview payload is missing inProgressAssignments');
  }

  if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
    throw new Error('Catalog should return demo courses');
  }

  if (!Array.isArray(certificates.items)) {
    throw new Error('Certificates payload is invalid');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        moduleAccess,
        overviewCounts: overview.tabsSummary,
        catalogCount: catalog.total,
        certificatesCount: certificates.items.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
