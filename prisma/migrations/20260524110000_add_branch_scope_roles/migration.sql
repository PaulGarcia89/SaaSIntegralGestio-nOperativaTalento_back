-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('TENANT_ADMIN', 'BRANCH_ADMIN', 'BRANCH_USER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "activeBranchId" TEXT;

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateIndex
CREATE INDEX "User_activeBranchId_idx" ON "User"("activeBranchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeBranchId_fkey" FOREIGN KEY ("activeBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
