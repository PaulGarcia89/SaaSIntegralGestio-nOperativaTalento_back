ALTER TABLE "TrainingAssignment"
ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TrainingLessonProgress" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastOpenedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingLessonProgress_tenantId_userId_lessonId_key"
ON "TrainingLessonProgress"("tenantId", "userId", "lessonId");

CREATE INDEX "TrainingLessonProgress_tenantId_userId_isCompleted_idx"
ON "TrainingLessonProgress"("tenantId", "userId", "isCompleted");

CREATE INDEX "TrainingLessonProgress_lessonId_idx"
ON "TrainingLessonProgress"("lessonId");

ALTER TABLE "TrainingLessonProgress"
ADD CONSTRAINT "TrainingLessonProgress_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingLessonProgress"
ADD CONSTRAINT "TrainingLessonProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingLessonProgress"
ADD CONSTRAINT "TrainingLessonProgress_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, code, code, 'Training assignment permission', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES ('training.assign'), ('training.progress.read')
) AS requested(code)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON (
  role."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN', 'HR_MANAGER')
  AND permission."code" IN ('training.assign', 'training.progress.read')
) OR (
  role."code" IN ('INSTRUCTOR', 'SUPERVISOR')
  AND permission."code" = 'training.progress.read'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
