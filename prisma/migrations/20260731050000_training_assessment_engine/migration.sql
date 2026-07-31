CREATE TYPE "TrainingQuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "TrainingQuizFeedbackMode" AS ENUM ('AFTER_SUBMISSION', 'AFTER_PASSING', 'NEVER');

ALTER TABLE "TrainingQuiz"
ADD COLUMN "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "randomQuestionCount" INTEGER,
ADD COLUMN "cooldownMinutes" INTEGER,
ADD COLUMN "availableFrom" TIMESTAMP(3),
ADD COLUMN "availableUntil" TIMESTAMP(3),
ADD COLUMN "requireAllQuestions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "feedbackMode" "TrainingQuizFeedbackMode" NOT NULL DEFAULT 'AFTER_SUBMISSION',
ADD COLUMN "rubric" JSONB;

ALTER TABLE "TrainingQuizQuestion"
ADD COLUMN "bankItemId" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "difficulty" "TrainingQuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rubric" JSONB;

ALTER TABLE "TrainingQuizAttempt"
ADD COLUMN "questionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "TrainingQuestionBankItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "questionType" "TrainingQuizQuestionType" NOT NULL,
  "explanation" TEXT,
  "points" INTEGER NOT NULL DEFAULT 1,
  "requiresManualGrading" BOOLEAN NOT NULL DEFAULT false,
  "category" TEXT,
  "difficulty" "TrainingQuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rubric" JSONB,
  "options" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingQuestionBankItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingQuestionBankItem_tenantId_isActive_idx" ON "TrainingQuestionBankItem"("tenantId", "isActive");
CREATE INDEX "TrainingQuestionBankItem_tenantId_category_difficulty_idx" ON "TrainingQuestionBankItem"("tenantId", "category", "difficulty");
CREATE INDEX "TrainingQuizQuestion_bankItemId_idx" ON "TrainingQuizQuestion"("bankItemId");

ALTER TABLE "TrainingQuestionBankItem" ADD CONSTRAINT "TrainingQuestionBankItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingQuizQuestion" ADD CONSTRAINT "TrainingQuizQuestion_bankItemId_fkey" FOREIGN KEY ("bankItemId") REFERENCES "TrainingQuestionBankItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
