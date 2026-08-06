CREATE TABLE "TalentCampaignApproval" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "approverId" TEXT NOT NULL, "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "note" TEXT, CONSTRAINT "TalentCampaignApproval_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "TalentCampaignApproval_campaignId_approverId_key" ON "TalentCampaignApproval"("campaignId", "approverId");
CREATE INDEX "TalentCampaignApproval_tenantId_campaignId_approvedAt_idx" ON "TalentCampaignApproval"("tenantId", "campaignId", "approvedAt");
ALTER TABLE "TalentCampaignApproval" ADD CONSTRAINT "TalentCampaignApproval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "TalentCampaign"("id") ON DELETE CASCADE;
