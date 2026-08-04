import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { ProductionIntegrationCertificationService } from "../src/metrics/production-integration-certification.service";

async function main() {
  const active = process.env.CERTIFICATION_ACTIVE_PROBES === "true";
  if (
    active
    && process.env.NODE_ENV === "production"
    && process.env.PRODUCTION_CERTIFICATION_CONFIRM !== "SAFE_READ_WRITE_PROBES"
  ) {
    throw new Error(
      "Set PRODUCTION_CERTIFICATION_CONFIRM=SAFE_READ_WRITE_PROBES to run active production probes",
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const service = app.get(ProductionIntegrationCertificationService);
    const report = active
      ? await service.certify({ active: true, tenantId: process.env.CERTIFICATION_TENANT_ID })
      : await service.inspect(process.env.CERTIFICATION_TENANT_ID);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status === "FAIL") process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
