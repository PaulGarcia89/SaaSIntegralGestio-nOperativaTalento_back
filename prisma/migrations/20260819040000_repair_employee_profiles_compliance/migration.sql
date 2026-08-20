-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "EmploymentStatusProfile" AS ENUM ('ACTIVE', 'INACTIVE', 'LEAVE', 'TERMINATED', 'DRAFT');

-- CreateEnum
CREATE TYPE "EmployeePayType" AS ENUM ('SALARY', 'HOURLY', 'COMMISSION', 'TIP_BASED', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeePayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "EmployeePaymentMethod" AS ENUM ('DIRECT_DEPOSIT', 'CHECK', 'PAY_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeW4Status" AS ENUM ('NOT_STARTED', 'PENDING', 'COMPLETE', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "EmployeeI9Status" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'EXPIRED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "EmployeeEVerifyStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'AUTHORIZED', 'TNC', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmployeeFloridaNewHireStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmployeeComplianceCategory" AS ENUM ('TAX', 'ELIGIBILITY', 'FLORIDA', 'PAYROLL', 'DOCUMENT', 'TRAINING', 'LICENSE', 'SAFETY');

-- CreateEnum
CREATE TYPE "EmployeeComplianceStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'COMPLETE', 'EXPIRING', 'EXPIRED', 'NOT_REQUIRED', 'WAIVED');

-- CreateEnum
CREATE TYPE "EmployeeComplianceSource" AS ENUM ('SYSTEM', 'POLICY', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmployeeDocumentSensitivity" AS ENUM ('STANDARD', 'SENSITIVE', 'HIGHLY_SENSITIVE');

-- CreateEnum
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DELETED');

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalHoldReason" TEXT,
ADD COLUMN     "retentionUntil" TIMESTAMP(3),
ADD COLUMN     "sensitivity" "EmployeeDocumentSensitivity" NOT NULL DEFAULT 'STANDARD';

-- Convert the legacy text status without discarding existing document history.
ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" TYPE "EmployeeDocumentStatus"
USING CASE
  WHEN "status" IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DELETED')
    THEN "status"::"EmployeeDocumentStatus"
  ELSE 'PENDING_REVIEW'::"EmployeeDocumentStatus"
END;
ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "legalFirstName" TEXT,
ADD COLUMN     "legalLastName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "workEmail" TEXT;

-- Preserve legacy employees by assigning a stable, tenant-unique payroll identifier.
UPDATE "Employee"
SET "employeeNumber" = 'EMP-' || "id"
WHERE "employeeNumber" IS NULL;

ALTER TABLE "Employee" ALTER COLUMN "employeeNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "EmployeeEmploymentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "department" TEXT,
    "positionId" TEXT,
    "supervisorUserId" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "employmentStatus" "EmploymentStatusProfile" NOT NULL DEFAULT 'DRAFT',
    "hireDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "jobTitle" TEXT NOT NULL,
    "workerClassification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEmploymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payType" "EmployeePayType" NOT NULL,
    "payRateEncrypted" TEXT,
    "payRateLast4" TEXT,
    "payFrequency" "EmployeePayFrequency" NOT NULL,
    "overtimeEligible" BOOLEAN,
    "regularHourlyRateEncrypted" TEXT,
    "regularHourlyRateLast4" TEXT,
    "workweekStartDay" TEXT,
    "workweekStartTime" TEXT,
    "paymentMethod" "EmployeePaymentMethod" NOT NULL,
    "payrollProvider" TEXT,
    "payrollEmployeeId" TEXT,
    "externalPayrollReference" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTaxProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "ssnEncrypted" TEXT,
    "ssnLast4" TEXT,
    "w4Status" "EmployeeW4Status" NOT NULL DEFAULT 'NOT_STARTED',
    "w4CompletedAt" TIMESTAMP(3),
    "w4DocumentId" TEXT,
    "w2Reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkEligibilityProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "i9Status" "EmployeeI9Status" NOT NULL DEFAULT 'NOT_STARTED',
    "firstDayOfEmployment" TIMESTAMP(3),
    "section1CompletedAt" TIMESTAMP(3),
    "section2CompletedAt" TIMESTAMP(3),
    "verificationDueDate" TIMESTAMP(3),
    "verificationCompletedAt" TIMESTAMP(3),
    "reverificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "reverificationDueDate" TIMESTAMP(3),
    "i9DocumentId" TEXT,
    "eVerifyRequired" BOOLEAN NOT NULL DEFAULT false,
    "eVerifyStatus" "EmployeeEVerifyStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "eVerifyCaseNumber" TEXT,
    "eVerifySubmittedAt" TIMESTAMP(3),
    "eVerifyCompletedAt" TIMESTAMP(3),
    "eVerifyDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkEligibilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeFloridaNewHireReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmployeeFloridaNewHireStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "dueDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "confirmationNumber" TEXT,
    "documentId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeFloridaNewHireReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeComplianceRequirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "EmployeeComplianceCategory" NOT NULL,
    "jurisdiction" TEXT,
    "status" "EmployeeComplianceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "documentId" TEXT,
    "verificationStatus" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "source" "EmployeeComplianceSource" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEmploymentProfile_employeeId_key" ON "EmployeeEmploymentProfile"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentProfile_tenantId_branchId_idx" ON "EmployeeEmploymentProfile"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollProfile_employeeId_key" ON "EmployeePayrollProfile"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeePayrollProfile_tenantId_effectiveFrom_idx" ON "EmployeePayrollProfile"("tenantId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTaxProfile_employeeId_key" ON "EmployeeTaxProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkEligibilityProfile_employeeId_key" ON "EmployeeWorkEligibilityProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeFloridaNewHireReport_employeeId_key" ON "EmployeeFloridaNewHireReport"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeComplianceRequirement_tenantId_employeeId_status_idx" ON "EmployeeComplianceRequirement"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeComplianceRequirement_tenantId_expiresAt_idx" ON "EmployeeComplianceRequirement"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeComplianceRequirement_employeeId_code_key" ON "EmployeeComplianceRequirement"("employeeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_employeeNumber_key" ON "Employee"("tenantId", "employeeNumber");

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentProfile" ADD CONSTRAINT "EmployeeEmploymentProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentProfile" ADD CONSTRAINT "EmployeeEmploymentProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentProfile" ADD CONSTRAINT "EmployeeEmploymentProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentProfile" ADD CONSTRAINT "EmployeeEmploymentProfile_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollProfile" ADD CONSTRAINT "EmployeePayrollProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollProfile" ADD CONSTRAINT "EmployeePayrollProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTaxProfile" ADD CONSTRAINT "EmployeeTaxProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTaxProfile" ADD CONSTRAINT "EmployeeTaxProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTaxProfile" ADD CONSTRAINT "EmployeeTaxProfile_w4DocumentId_fkey" FOREIGN KEY ("w4DocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibilityProfile" ADD CONSTRAINT "EmployeeWorkEligibilityProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibilityProfile" ADD CONSTRAINT "EmployeeWorkEligibilityProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibilityProfile" ADD CONSTRAINT "EmployeeWorkEligibilityProfile_i9DocumentId_fkey" FOREIGN KEY ("i9DocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibilityProfile" ADD CONSTRAINT "EmployeeWorkEligibilityProfile_eVerifyDocumentId_fkey" FOREIGN KEY ("eVerifyDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFloridaNewHireReport" ADD CONSTRAINT "EmployeeFloridaNewHireReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFloridaNewHireReport" ADD CONSTRAINT "EmployeeFloridaNewHireReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeFloridaNewHireReport" ADD CONSTRAINT "EmployeeFloridaNewHireReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeComplianceRequirement" ADD CONSTRAINT "EmployeeComplianceRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeComplianceRequirement" ADD CONSTRAINT "EmployeeComplianceRequirement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeComplianceRequirement" ADD CONSTRAINT "EmployeeComplianceRequirement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeComplianceRequirement" ADD CONSTRAINT "EmployeeComplianceRequirement_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
