ALTER TABLE "Plan" ADD COLUMN "limits" JSONB;

UPDATE "Plan"
SET "limits" = CASE "code"
  WHEN 'BASIC' THEN '{"maxUsers":25,"maxBranches":1,"maxActiveVacancies":10,"maxCourses":20,"maxAssets":250,"storageGb":10}'::jsonb
  WHEN 'PRO' THEN '{"maxUsers":150,"maxBranches":10,"maxActiveVacancies":75,"maxCourses":150,"maxAssets":2500,"storageGb":100}'::jsonb
  ELSE '{"maxUsers":null,"maxBranches":null,"maxActiveVacancies":null,"maxCourses":null,"maxAssets":null,"storageGb":1000}'::jsonb
END
WHERE "limits" IS NULL;
