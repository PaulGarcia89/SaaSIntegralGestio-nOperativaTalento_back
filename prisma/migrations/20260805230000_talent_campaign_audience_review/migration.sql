-- A campaign cannot be dispatched until its calculated audience has an auditable review.
ALTER TABLE "TalentCampaign"
  ADD COLUMN "audiencePreparedAt" TIMESTAMP(3),
  ADD COLUMN "audienceReviewedAt" TIMESTAMP(3),
  ADD COLUMN "audienceReviewedById" TEXT,
  ADD COLUMN "audienceReviewNote" TEXT,
  ADD COLUMN "audienceFingerprint" TEXT;
