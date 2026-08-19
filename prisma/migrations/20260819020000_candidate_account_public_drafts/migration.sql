ALTER TABLE "PublicApplicationDraft"
ADD COLUMN "candidateAccountId" TEXT;

ALTER TABLE "PublicApplicationDraft"
ADD CONSTRAINT "PublicApplicationDraft_candidateAccountId_fkey"
FOREIGN KEY ("candidateAccountId") REFERENCES "CandidateAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PublicApplicationDraft_candidateAccountId_vacancyId_key"
ON "PublicApplicationDraft"("candidateAccountId", "vacancyId");
