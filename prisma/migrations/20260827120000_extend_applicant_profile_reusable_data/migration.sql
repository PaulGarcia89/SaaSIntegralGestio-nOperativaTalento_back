ALTER TABLE "ApplicantProfile"
  ADD COLUMN "reusableData" JSONB,
  ADD COLUMN "encryptedSocialSecurityNumber" TEXT,
  ADD COLUMN "socialSecurityNumberLast4" VARCHAR(4),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
