const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1").replace(/\/$/, "");
const concurrency = Number(process.env.SMOKE_CONCURRENCY ?? 10);
const requests = Number(process.env.SMOKE_REQUESTS ?? 50);
const maxP95Ms = Number(process.env.SMOKE_MAX_P95_MS ?? 1_500);

async function request(path) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(5_000),
    redirect: "manual",
  });
  return { status: response.status, duration: performance.now() - startedAt };
}

let healthPath = "/healthz";
let health = await request(healthPath);
if (health.status === 404) {
  healthPath = "/api/health";
  health = await request(healthPath);
}
if (health.status === 404) {
  healthPath = "/health";
  health = await request(healthPath);
}
if (health.status !== 200) {
  throw new Error(`Health check failed with HTTP ${health.status}`);
}

const protectedEndpoint = await request("/api/training/integrations");
if (protectedEndpoint.status !== 401) {
  throw new Error(
    `Protected endpoint must reject anonymous requests; received HTTP ${protectedEndpoint.status}`,
  );
}

const durations = [];
let nextRequest = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (nextRequest < requests) {
      nextRequest += 1;
      const result = await request(healthPath);
      if (result.status !== 200) {
        throw new Error(`Concurrent health request failed with HTTP ${result.status}`);
      }
      durations.push(result.duration);
    }
  }),
);

durations.sort((left, right) => left - right);
const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
if (p95 > maxP95Ms) {
  throw new Error(`Health p95 ${p95.toFixed(1)}ms exceeded ${maxP95Ms}ms`);
}

console.log(
  JSON.stringify({
    status: "ok",
    baseUrl,
    requests,
    concurrency,
    p95Ms: Number(p95.toFixed(1)),
  }),
);
