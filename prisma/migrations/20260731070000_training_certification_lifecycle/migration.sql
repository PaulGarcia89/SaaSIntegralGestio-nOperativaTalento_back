CREATE TABLE "TrainingCertificationPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoIssue" BOOLEAN NOT NULL DEFAULT true,
  "requireAssessment" BOOLEAN NOT NULL DEFAULT true,
  "requireAllRequiredLessons" BOOLEAN NOT NULL DEFAULT true,
  "validityDays" INTEGER,
  "renewalWindowDays" INTEGER NOT NULL DEFAULT 30,
  "reminderDays" INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 1]::INTEGER[],
  "certificateTitle" TEXT,
  "certificateDescription" TEXT,
  "signatoryName" TEXT,
  "signatoryTitle" TEXT,
  "badgeImageUrl" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCertificationPolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingCertificate"
ADD COLUMN "certificateNumber" TEXT,
ADD COLUMN "policyId" TEXT,
ADD COLUMN "policyVersion" INTEGER,
ADD COLUMN "evidenceSnapshot" JSONB,
ADD COLUMN "issuedById" TEXT,
ADD COLUMN "issuedReason" TEXT NOT NULL DEFAULT 'COMPLETION',
ADD COLUMN "renewedFromId" TEXT,
ADD COLUMN "supersededAt" TIMESTAMP(3);

UPDATE "TrainingCertificate"
SET "certificateNumber" = 'CERT-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 12));

ALTER TABLE "TrainingCertificate" ALTER COLUMN "certificateNumber" SET NOT NULL;

DROP INDEX IF EXISTS "TrainingCertificate_tenantId_userId_curriculumId_key";
DROP INDEX IF EXISTS "TrainingCertificate_tenantId_userId_courseId_key";

CREATE UNIQUE INDEX "TrainingCertificationPolicy_courseId_key" ON "TrainingCertificationPolicy"("courseId");
CREATE INDEX "TrainingCertificationPolicy_tenantId_isEnabled_idx" ON "TrainingCertificationPolicy"("tenantId", "isEnabled");
CREATE UNIQUE INDEX "TrainingCertificate_certificateNumber_key" ON "TrainingCertificate"("certificateNumber");
CREATE INDEX "TrainingCertificate_tenantId_courseId_userId_supersededAt_idx" ON "TrainingCertificate"("tenantId", "courseId", "userId", "supersededAt");
CREATE INDEX "TrainingCertificate_expiresAt_supersededAt_revokedAt_idx" ON "TrainingCertificate"("expiresAt", "supersededAt", "revokedAt");
CREATE INDEX "TrainingCertificate_renewedFromId_idx" ON "TrainingCertificate"("renewedFromId");
CREATE UNIQUE INDEX "TrainingCertificate_active_course_key" ON "TrainingCertificate"("tenantId", "userId", "courseId") WHERE "courseId" IS NOT NULL AND "revokedAt" IS NULL AND "supersededAt" IS NULL;
CREATE UNIQUE INDEX "TrainingCertificate_active_curriculum_key" ON "TrainingCertificate"("tenantId", "userId", "curriculumId") WHERE "curriculumId" IS NOT NULL AND "revokedAt" IS NULL AND "supersededAt" IS NULL;

ALTER TABLE "TrainingCertificationPolicy" ADD CONSTRAINT "TrainingCertificationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificationPolicy" ADD CONSTRAINT "TrainingCertificationPolicy_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TrainingCertificationPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "TrainingCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
