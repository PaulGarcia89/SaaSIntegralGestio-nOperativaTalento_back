-- CreateTable
CREATE TABLE "PublicApplicationDraft" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicApplicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicApplicationDraft_tokenHash_key" ON "PublicApplicationDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicApplicationDraft_vacancyId_expiresAt_idx" ON "PublicApplicationDraft"("vacancyId", "expiresAt");

-- AddForeignKey
ALTER TABLE "PublicApplicationDraft" ADD CONSTRAINT "PublicApplicationDraft_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
