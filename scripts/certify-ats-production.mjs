import { writeFileSync } from "node:fs";

const checks = [];
let failureEmitted = false;
process.on("unhandledRejection", emitFailure);
process.on("uncaughtException", emitFailure);

const baseUrl = required("ATS_CERT_BASE_URL").replace(/\/$/, "");
const email = required("ATS_CERT_EMAIL");
const password = required("ATS_CERT_PASSWORD");
const tenantSlug = process.env.ATS_CERT_TENANT_SLUG?.trim();
const expectedTenantId = process.env.ATS_CERT_EXPECTED_TENANT_ID?.trim();
const expectedBranchId = process.env.ATS_CERT_EXPECTED_BRANCH_ID?.trim();
const timeoutMs = boundedNumber("ATS_CERT_TIMEOUT_MS", 12_000, 1_000, 60_000);
const maxP95Ms = boundedNumber("ATS_CERT_MAX_P95_MS", 2_000, 100, 30_000);

if (!baseUrl.startsWith("https://") && process.env.ATS_CERT_ALLOW_HTTP !== "true") {
  throw new Error("ATS_CERT_BASE_URL debe usar HTTPS; habilita ATS_CERT_ALLOW_HTTP=true solo para entornos locales");
}

async function call(name, path, options = {}) {
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { accept: "application/json", ...options.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    checks.push({ name, status: "FAIL", durationMs: elapsed(startedAt), detail: safeError(error) });
    throw error;
  }
  const durationMs = elapsed(startedAt);
  const body = await readBody(response);
  checks.push({ name, status: response.ok ? "PASS" : "FAIL", httpStatus: response.status, durationMs });
  return { response, body, durationMs };
}

const live = await call("API disponible", "/api/health/live");
assertStatus(live, 200, "El endpoint de disponibilidad no respondió correctamente");

const ready = await call("Base de datos disponible", "/api/health");
assertStatus(ready, 200, "El endpoint de salud no confirmó la base de datos");
if (ready.body?.checks?.database !== "ok") throw new Error("La base de datos no reportó estado ok");

const anonymous = await call("ATS protegido contra acceso anónimo", "/api/applications?page=1&pageSize=1");
if (anonymous.response.status !== 401) {
  throw new Error(`El ATS permitió una respuesta anónima inesperada: HTTP ${anonymous.response.status}`);
}
checks.at(-1).status = "PASS";

const login = await call("Autenticación de cuenta certificadora", "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, ...(tenantSlug ? { tenantSlug } : {}) }),
});
assertStatus(login, 201, "No fue posible autenticar la cuenta certificadora");
const token = login.body?.accessToken;
const user = login.body?.user;
if (!token || !user?.tenantId) throw new Error("La autenticación no devolvió un contexto verificable");
if (expectedTenantId && user.tenantId !== expectedTenantId) throw new Error("La cuenta certificadora resolvió una empresa inesperada");
if (expectedBranchId && user.activeBranchId !== expectedBranchId) throw new Error("La cuenta certificadora resolvió una sucursal inesperada");
if (!Array.isArray(user.enabledModules) || !user.enabledModules.includes("ATS")) throw new Error("La cuenta certificadora no tiene el módulo ATS habilitado");

const scopedHeaders = {
  authorization: `Bearer ${token}`,
  "x-tenant-id": user.tenantId,
  ...(user.activeBranchId ? { "x-branch-id": user.activeBranchId } : {}),
};

const me = await call("Sesión y alcance vigentes", "/api/auth/me", { headers: scopedHeaders });
assertStatus(me, 200, "La sesión no pudo recuperar su contexto");
if (me.body?.tenantId !== user.tenantId) throw new Error("El contexto de sesión cambió de empresa");

const vacancies = await call("Lectura de vacantes", "/api/vacancies?page=1&pageSize=1", { headers: scopedHeaders });
assertStatus(vacancies, 200, "No fue posible consultar vacantes");
assertPage(vacancies.body, "vacantes");

const applications = await call("Lectura paginada de postulaciones", "/api/applications?page=1&pageSize=1", { headers: scopedHeaders });
assertStatus(applications, 200, "No fue posible consultar postulaciones");
assertPage(applications.body, "postulaciones");

const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const to = new Date().toISOString().slice(0, 10);
const analytics = await call(
  "Analítica ATS por alcance",
  `/api/reports/ats-analytics?from=${from}&to=${to}`,
  { headers: scopedHeaders },
);
assertStatus(analytics, 200, "No fue posible consultar analítica ATS");
if (analytics.body?.scope?.tenantId !== user.tenantId) throw new Error("La analítica ATS respondió fuera del alcance esperado");

const durations = checks.filter((check) => check.durationMs !== undefined).map((check) => check.durationMs).sort((a, b) => a - b);
const p95Ms = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0;
if (p95Ms > maxP95Ms) throw new Error(`La latencia p95 de certificación (${p95Ms} ms) excede ${maxP95Ms} ms`);

emit({
  status: "PASS",
  mode: "READ_ONLY",
  generatedAt: new Date().toISOString(),
  target: new URL(baseUrl).host,
  tenantId: user.tenantId,
  branchId: user.activeBranchId ?? null,
  checks,
  p95Ms,
});

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria`);
  return value;
}

function boundedNumber(name, fallback, min, max) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 300) }; }
}

function assertStatus(result, expected, message) {
  if (result.response.status !== expected) throw new Error(`${message}: HTTP ${result.response.status}`);
}

function assertPage(body, label) {
  if (!Array.isArray(body?.data) || typeof body?.meta?.total !== "number") {
    throw new Error(`La respuesta de ${label} no cumple el contrato paginado`);
  }
}

function elapsed(startedAt) {
  return Number((performance.now() - startedAt).toFixed(1));
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

function emit(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.ATS_CERT_REPORT_PATH) {
    writeFileSync(process.env.ATS_CERT_REPORT_PATH, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
}

function emitFailure(error) {
  if (failureEmitted) return;
  failureEmitted = true;
  emit({
    status: "FAIL",
    mode: "READ_ONLY",
    generatedAt: new Date().toISOString(),
    target: process.env.ATS_CERT_BASE_URL ? safeHost(process.env.ATS_CERT_BASE_URL) : null,
    checks,
    error: safeError(error),
  });
  process.exitCode = 1;
}

function safeHost(value) {
  try { return new URL(value).host; } catch { return "invalid-url"; }
}
