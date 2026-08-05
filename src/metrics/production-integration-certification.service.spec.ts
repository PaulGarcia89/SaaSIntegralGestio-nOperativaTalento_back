import { ProductionIntegrationCertificationService } from "./production-integration-certification.service";

describe("ProductionIntegrationCertificationService", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("reports incomplete production configuration without exposing secrets", async () => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    delete process.env.RESEND_API_KEY;
    const service = new ProductionIntegrationCertificationService({} as never);

    const report = await service.inspect();

    expect(report.status).toBe("FAIL");
    expect(report.mode).toBe("CONFIGURATION");
    expect(report.checks).toHaveLength(6);
    expect(JSON.stringify(report)).not.toContain("Bearer ");
  });

  it("aggregates successful active probes", async () => {
    process.env = { ...originalEnv, NODE_ENV: "production" };
    const service = new ProductionIntegrationCertificationService({} as never);
    const pass = (key: string) => ({
      key,
      label: key,
      status: "PASS" as const,
      configured: true,
      activeProbe: true,
      summary: "ok",
      durationMs: 1,
      evidence: {},
    });
    jest.spyOn(service as any, "certifyEmail").mockResolvedValue(pass("email"));
    jest.spyOn(service as any, "certifyStorage").mockImplementation((profile: unknown) => {
      return Promise.resolve(pass((profile as { key: string }).key));
    });
    jest.spyOn(service as any, "certifyClamAv").mockResolvedValue(pass("clamav"));
    jest.spyOn(service as any, "certifyCalendars").mockResolvedValue(pass("calendars"));

    const report = await service.certify({ active: true });

    expect(report.status).toBe("PASS");
    expect(report.summary).toEqual({ passed: 6, warnings: 0, failed: 0, skipped: 0 });
  });
});
