CREATE TABLE "VacancyFormTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTitle" TEXT,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyFormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VacancyFormTemplate_tenantId_idx" ON "VacancyFormTemplate"("tenantId");

CREATE UNIQUE INDEX "VacancyFormTemplate_tenantId_name_key" ON "VacancyFormTemplate"("tenantId", "name");

ALTER TABLE "VacancyFormTemplate"
ADD CONSTRAINT "VacancyFormTemplate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
