ALTER TABLE "UserSession"
ADD COLUMN "activeTenantId" TEXT,
ADD COLUMN "impersonationTenantId" TEXT,
ADD COLUMN "impersonationStartedAt" TIMESTAMP(3),
ADD COLUMN "impersonationReason" TEXT;

CREATE TABLE "PlatformTenantAccess" (
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformTenantAccess_pkey" PRIMARY KEY ("userId","tenantId")
);

CREATE INDEX "PlatformTenantAccess_tenantId_idx" ON "PlatformTenantAccess"("tenantId");

ALTER TABLE "PlatformTenantAccess"
ADD CONSTRAINT "PlatformTenantAccess_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformTenantAccess"
ADD CONSTRAINT "PlatformTenantAccess_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
