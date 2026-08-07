ALTER TABLE "OnboardingRetentionPolicy"
  ADD COLUMN "legalReviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);
