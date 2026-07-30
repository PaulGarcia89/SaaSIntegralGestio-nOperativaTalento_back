CREATE TYPE "TrainingCourseStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'PAUSED',
  'ARCHIVED',
  'RETIRED'
);

CREATE TYPE "TrainingContentBlockType" AS ENUM (
  'RICH_TEXT',
  'VIDEO',
  'FILE',
  'LINK',
  'QUIZ',
  'TASK'
);

ALTER TABLE "TrainingCourse"
  ADD COLUMN "status" "TrainingCourseStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN "introVideoUrl" TEXT,
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
  ADD COLUMN "scheduledRetireAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sourceCourseId" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

UPDATE "TrainingCourse"
SET "status" = 'PUBLISHED',
    "publishedAt" = COALESCE("updatedAt", "createdAt")
WHERE "isPublished" = true;

CREATE TABLE "TrainingCourseModule" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCourseModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingLesson" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "estimatedMinutes" INTEGER,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingContentBlock" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "type" "TrainingContentBlockType" NOT NULL,
  "title" TEXT,
  "content" JSONB,
  "resourceUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingContentBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCourseVersion" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "TrainingCourseStatus" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCourseTransition" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "fromStatus" "TrainingCourseStatus",
  "toStatus" "TrainingCourseStatus" NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingCourseTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingCourse_tenantId_status_idx" ON "TrainingCourse"("tenantId", "status");
CREATE INDEX "TrainingCourse_scheduledPublishAt_idx" ON "TrainingCourse"("scheduledPublishAt");
CREATE INDEX "TrainingCourse_scheduledRetireAt_idx" ON "TrainingCourse"("scheduledRetireAt");
CREATE INDEX "TrainingCourse_sourceCourseId_idx" ON "TrainingCourse"("sourceCourseId");
CREATE INDEX "TrainingCourseModule_courseId_sortOrder_idx" ON "TrainingCourseModule"("courseId", "sortOrder");
CREATE INDEX "TrainingLesson_moduleId_sortOrder_idx" ON "TrainingLesson"("moduleId", "sortOrder");
CREATE INDEX "TrainingContentBlock_lessonId_sortOrder_idx" ON "TrainingContentBlock"("lessonId", "sortOrder");
CREATE INDEX "TrainingContentBlock_type_idx" ON "TrainingContentBlock"("type");
CREATE UNIQUE INDEX "TrainingCourseVersion_courseId_version_key" ON "TrainingCourseVersion"("courseId", "version");
CREATE INDEX "TrainingCourseVersion_courseId_createdAt_idx" ON "TrainingCourseVersion"("courseId", "createdAt");
CREATE INDEX "TrainingCourseTransition_courseId_createdAt_idx" ON "TrainingCourseTransition"("courseId", "createdAt");
CREATE INDEX "TrainingCourseTransition_actorId_createdAt_idx" ON "TrainingCourseTransition"("actorId", "createdAt");

ALTER TABLE "TrainingCourseModule"
  ADD CONSTRAINT "TrainingCourseModule_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingLesson"
  ADD CONSTRAINT "TrainingLesson_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "TrainingCourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingContentBlock"
  ADD CONSTRAINT "TrainingContentBlock_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingCourseVersion"
  ADD CONSTRAINT "TrainingCourseVersion_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingCourseTransition"
  ADD CONSTRAINT "TrainingCourseTransition_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, code, code, 'Course authoring permission', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('training.course.read'),
    ('training.course.create'),
    ('training.course.update'),
    ('training.course.review'),
    ('training.course.approve'),
    ('training.course.publish'),
    ('training.course.archive'),
    ('training.course.delete')
) AS requested(code)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON (
  role."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN', 'HR_MANAGER')
  AND permission."code" LIKE 'training.course.%'
) OR (
  role."code" = 'INSTRUCTOR'
  AND permission."code" IN (
    'training.course.read',
    'training.course.create',
    'training.course.update',
    'training.course.review'
  )
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
