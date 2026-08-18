CREATE TABLE "WorkspaceView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "workspaceKey" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceView_tenantId_userId_module_screen_workspaceKey_name_key"
ON "WorkspaceView"("tenantId", "userId", "module", "screen", "workspaceKey", "name");
CREATE INDEX "WorkspaceView_tenantId_module_screen_workspaceKey_updatedAt_idx"
ON "WorkspaceView"("tenantId", "module", "screen", "workspaceKey", "updatedAt");
CREATE INDEX "WorkspaceView_tenantId_userId_module_screen_idx"
ON "WorkspaceView"("tenantId", "userId", "module", "screen");

ALTER TABLE "WorkspaceView" ADD CONSTRAINT "WorkspaceView_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceView" ADD CONSTRAINT "WorkspaceView_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
