ALTER TABLE "InventoryAsset"
  ADD COLUMN "onboardingFlowId" TEXT;

CREATE INDEX "InventoryAsset_onboardingFlowId_idx"
  ON "InventoryAsset"("onboardingFlowId");

ALTER TABLE "InventoryAsset"
  ADD CONSTRAINT "InventoryAsset_onboardingFlowId_fkey"
  FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
