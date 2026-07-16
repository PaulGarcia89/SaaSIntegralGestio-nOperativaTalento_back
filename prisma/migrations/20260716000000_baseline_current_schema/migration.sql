-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "VacancyWorkMode" AS ENUM ('ON_SITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "VacancyEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'REVIEWING', 'INTERVIEW', 'APPROVED', 'REJECTED', 'TRAINING', 'HIRED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PRESENTIAL', 'VIRTUAL', 'PHONE');

-- CreateEnum
CREATE TYPE "ApplicationTimelineEventType" AS ENUM ('VACANCY_PUBLISHED', 'APPLIED', 'CONTACTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('TENANT_ADMIN', 'BRANCH_ADMIN', 'BRANCH_USER');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('GLOBAL', 'TENANT', 'BRANCH');

-- CreateEnum
CREATE TYPE "AuditDomain" AS ENUM ('GOVERNANCE_GLOBAL', 'TENANT_OPERATIONS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('BASIC', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ModuleCode" AS ENUM ('ATS', 'ONBOARDING', 'TRAINING', 'INVENTORY', 'AI_PRODUCTIVITY', 'DOCUMENTS', 'REPORTS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "TrainingDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingCourseType" AS ENUM ('COURSE', 'VIDEO', 'DOCUMENT', 'QUIZ', 'SCORM', 'LIVE_SESSION');

-- CreateEnum
CREATE TYPE "TrainingResourceType" AS ENUM ('VIDEO', 'PDF', 'LINK', 'IMAGE', 'AUDIO', 'SCORM', 'ARTICLE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "TrainingCourseStepType" AS ENUM ('VIDEO', 'READING', 'QUIZ', 'FILE', 'TASK');

-- CreateEnum
CREATE TYPE "TrainingAssignmentType" AS ENUM ('CURRICULUM', 'COURSE');

-- CreateEnum
CREATE TYPE "TrainingAssignmentSourceType" AS ENUM ('MANUAL', 'RULE', 'SUBSCRIPTION', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "TrainingProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TrainingEventModality" AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "TrainingEventAttendanceStatus" AS ENUM ('INVITED', 'REGISTERED', 'ATTENDED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingQuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT');

-- CreateEnum
CREATE TYPE "TrainingQuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "TrainingFavoriteEntityType" AS ENUM ('COURSE', 'CURRICULUM', 'RESOURCE');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('HIRING', 'BRANCH_TRANSFER', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStageKey" AS ENUM ('CANDIDACY', 'HIRING', 'ONBOARDING', 'TRAINING', 'OPERATION', 'ADMIN_COMPLIANCE');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('CANDIDACY', 'HIRING', 'ONBOARDING', 'DOCUMENTS', 'SIGNATURES', 'ASSET_ASSIGNMENT', 'TRAINING', 'TRAINING_ACTIVATION', 'OPERATION', 'ACCESS_PROVISIONING', 'ADMIN_COMPLIANCE', 'PRODUCTIVITY_REVIEW', 'ASSET_RECOVERY', 'ACCESS_CLOSURE', 'ARCHIVE_RECORD');

-- CreateEnum
CREATE TYPE "WorkflowOwnerType" AS ENUM ('SYSTEM', 'USER', 'EMPLOYEE', 'CANDIDATE', 'BRANCH', 'INVENTORY', 'TRAINING', 'ACCESS', 'SIGNATURE', 'ONBOARDING', 'PRODUCTIVITY');

-- CreateEnum
CREATE TYPE "WorkflowSourceModule" AS ENUM ('ATS', 'ONBOARDING', 'INVENTORY', 'TRAINING', 'PRODUCTIVITY', 'ADMIN', 'HR');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowRiskStatus" AS ENUM ('ON_TIME', 'AT_RISK', 'OVERDUE');

-- CreateEnum
CREATE TYPE "WorkflowBlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkflowMasterSlaStatus" AS ENUM ('ON_TIME', 'AT_RISK', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AutomationScope" AS ENUM ('TENANT', 'BRANCH');

-- CreateEnum
CREATE TYPE "AutomationTriggerEvent" AS ENUM ('CANDIDATE_HIRED', 'EMPLOYEE_BRANCH_CHANGED', 'EMPLOYEE_OFFBOARDING_STARTED', 'ONBOARDING_COMPLETED', 'INVENTORY_ASSET_ASSIGNED', 'TRAINING_COMPLETED', 'OPERATION_HANDOFF_COMPLETED', 'COMPLIANCE_CLOSED');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AutomationStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationConsequenceType" AS ENUM ('CREATE_ONBOARDING', 'ASSIGN_ASSET', 'PROVISION_ACCESS', 'ACTIVATE_TRAINING', 'CREATE_POLICY_CHECK', 'MARK_WORKFLOW_STAGE', 'NOTIFY_ACTOR', 'ARCHIVE_RECORD', 'REVOKE_ACCESS');

-- CreateEnum
CREATE TYPE "AutomationAuditStatus" AS ENUM ('RECEIVED', 'STARTED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PolicyCheckStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetAssignmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingActivationStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingTaskType" AS ENUM ('DOCUMENT_COLLECTION', 'POLICY_REVIEW', 'MANAGER_CHECKLIST', 'HR_CHECKLIST', 'DAY_ONE_READINESS');

-- CreateEnum
CREATE TYPE "SignaturePackageStatus" AS ENUM ('DRAFT', 'PENDING', 'PARTIALLY_SIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureParticipantStatus" AS ENUM ('PENDING', 'SIGNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryAssignmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryRecoveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RECOVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessTaskType" AS ENUM ('PROVISION', 'UPDATE', 'CLOSE');

-- CreateEnum
CREATE TYPE "AccessTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PROVISIONED', 'CLOSED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductivityReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductivityReviewType" AS ENUM ('HIRING', 'BRANCH_TRANSFER', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "OperationalEventType" AS ENUM ('HIRING_INITIATED', 'BRANCH_TRANSFER_INITIATED', 'OFFBOARDING_INITIATED', 'CANDIDACY_COMPLETED', 'HIRING_COMPLETED', 'ONBOARDING_COMPLETED', 'TRAINING_COMPLETED', 'OPERATION_CONFIRMED', 'COMPLIANCE_COMPLETED', 'SIGNATURE_COMPLETED', 'ASSET_ASSIGNED', 'TRAINING_ACTIVATED', 'ACCESS_PROVISIONED', 'ASSET_RECOVERED', 'ACCESS_CLOSED', 'RECORD_ARCHIVED', 'PRODUCTIVITY_REVIEW_CREATED', 'WORKFLOW_STEP_STARTED', 'WORKFLOW_STEP_COMPLETED', 'WORKFLOW_NOTE_ADDED', 'WORKFLOW_BLOCKER_CREATED', 'WORKFLOW_BLOCKER_RESOLVED', 'MASTER_WORKFLOW_RECOMPUTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activeBranchId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "AccessScope" NOT NULL DEFAULT 'TENANT',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(10,2),
    "priceYearly" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureModule" (
    "id" TEXT NOT NULL,
    "code" "ModuleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanModule" (
    "planId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanModule_pkey" PRIMARY KEY ("planId","moduleId")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingProvider" "BillingProvider",
    "billingExternalId" TEXT,
    "billingCustomerId" TEXT,
    "currency" TEXT DEFAULT 'USD',

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleCode" "ModuleCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
    "externalCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
    "externalInvoiceId" TEXT NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "hostedInvoiceUrl" TEXT,
    "invoicePdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorTenantId" TEXT,
    "targetTenantId" TEXT,
    "branchId" TEXT,
    "userId" TEXT,
    "email" TEXT,
    "actorRole" TEXT,
    "actorScope" "AccessScope",
    "domain" "AuditDomain",
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "correlationId" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterWorkflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT,
    "candidateId" TEXT,
    "workflowType" "WorkflowType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStage" "WorkflowStepType",
    "currentStageKey" "WorkflowStageKey",
    "blockersSnapshot" JSONB,
    "ownerSummary" JSONB,
    "slaStatus" "WorkflowMasterSlaStatus" NOT NULL DEFAULT 'ON_TIME',
    "targetDate" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "triggeredByUserId" TEXT NOT NULL,
    "sourceModule" "WorkflowSourceModule" NOT NULL,
    "metadata" JSONB,
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stageKey" "WorkflowStageKey",
    "stepType" "WorkflowStepType" NOT NULL,
    "title" TEXT,
    "detail" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "ownerType" "WorkflowOwnerType" NOT NULL DEFAULT 'SYSTEM',
    "ownerId" TEXT,
    "ownerLabel" TEXT,
    "slaLabel" TEXT,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "riskStatus" "WorkflowRiskStatus" NOT NULL DEFAULT 'ON_TIME',
    "blockingReason" TEXT,
    "metadata" JSONB,
    "isCritical" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiringFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "employeeId" TEXT,
    "applicationId" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "hiredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiringFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "candidateId" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "readinessStatus" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "onboardingFlowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskType" "OnboardingTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ownerType" "WorkflowOwnerType" NOT NULL DEFAULT 'SYSTEM',
    "ownerId" TEXT,
    "blockingReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignaturePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT,
    "status" "SignaturePackageStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "externalProvider" TEXT,
    "externalPackageId" TEXT,
    "signedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignaturePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleLabel" TEXT,
    "status" "SignatureParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "itemId" TEXT,
    "status" "InventoryAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "assignedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryRecovery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "itemId" TEXT,
    "status" "InventoryRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTrainingAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT,
    "curriculumId" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskType" "AccessTaskType" NOT NULL,
    "status" "AccessTaskStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "permissions" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reviewType" "ProductivityReviewType" NOT NULL,
    "status" "ProductivityReviewStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductivityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" "OperationalEventType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "payload" JSONB,
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowBlocker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepKey" "WorkflowStageKey" NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "WorkflowBlockerSeverity" NOT NULL DEFAULT 'MEDIUM',
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBranch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qtyGlobal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "qtyLocal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "benefits" TEXT,
    "city" TEXT,
    "country" TEXT,
    "department" TEXT,
    "seniority" TEXT,
    "workMode" "VacancyWorkMode" NOT NULL DEFAULT 'ON_SITE',
    "employmentType" "VacancyEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT DEFAULT 'COP',
    "imageUrl" TEXT,
    "applicationFormSchema" JSONB,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyFormTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTitle" TEXT,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "resumeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "triggerEvent" "AutomationTriggerEvent" NOT NULL,
    "scope" "AutomationScope" NOT NULL DEFAULT 'TENANT',
    "conditions" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "consequences" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "ruleId" TEXT NOT NULL,
    "workflowId" TEXT,
    "employeeId" TEXT,
    "candidateId" TEXT,
    "actorUserId" TEXT,
    "triggerEvent" "AutomationTriggerEvent" NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecutionStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "executionId" TEXT NOT NULL,
    "consequence" "AutomationConsequenceType" NOT NULL,
    "status" "AutomationStepStatus" NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationExecutionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeId" TEXT,
    "candidateId" TEXT,
    "workflowId" TEXT,
    "ruleId" TEXT,
    "executionId" TEXT,
    "actorUserId" TEXT,
    "eventName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "AutomationAuditStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "workflowId" TEXT,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "policyCode" TEXT NOT NULL,
    "status" "PolicyCheckStatus" NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "detail" JSONB,
    "dueDate" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "workflowId" TEXT,
    "employeeId" TEXT,
    "inventoryAssignmentId" TEXT,
    "itemId" TEXT,
    "status" "AssetAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingActivation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "workflowId" TEXT,
    "employeeId" TEXT,
    "workflowTrainingAssignmentId" TEXT,
    "courseId" TEXT,
    "curriculumId" TEXT,
    "status" "TrainingActivationStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "coverLetter" TEXT,
    "dynamicResponses" JSONB,
    "notes" TEXT,
    "interviewType" "InterviewType",
    "interviewScheduledAt" TIMESTAMP(3),
    "interviewFollowUpAt" TIMESTAMP(3),
    "interviewObservations" TEXT,
    "contactedAt" TIMESTAMP(3),
    "interviewCompletedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationTimelineEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ApplicationTimelineEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTrainingModuleAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTrainingModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentCategoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCurriculum" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "objective" TEXT,
    "targetAudience" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCurriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "curriculumId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "type" "TrainingCourseType" NOT NULL,
    "resourceType" "TrainingResourceType" NOT NULL,
    "resourceUrl" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "points" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourseStep" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "TrainingCourseStepType" NOT NULL,
    "contentUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourseStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "assignedById" TEXT,
    "assignmentType" "TrainingAssignmentType" NOT NULL,
    "sourceType" "TrainingAssignmentSourceType" NOT NULL,
    "dueAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "TrainingProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingStepProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseStepId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "timeSpentSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingStepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "modality" "TrainingEventModality" NOT NULL,
    "relatedCourseId" TEXT,
    "relatedCurriculumId" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEventAttendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainingEventAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "registeredAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLibraryResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" "TrainingResourceType" NOT NULL,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "externalUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSeconds" INTEGER,
    "language" TEXT,
    "tags" TEXT[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingLibraryResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "passingScore" INTEGER NOT NULL,
    "maxAttempts" INTEGER,
    "timeLimitMinutes" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "TrainingQuizQuestionType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "passed" BOOLEAN,
    "status" "TrainingQuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT,
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "certificateUrl" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingFavorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "TrainingFavoriteEntityType" NOT NULL,
    "courseId" TEXT,
    "curriculumId" TEXT,
    "libraryResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalCourses" INTEGER NOT NULL DEFAULT 0,
    "completedCourses" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overdueCourses" INTEGER NOT NULL DEFAULT 0,
    "certificatesEarned" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_activeBranchId_idx" ON "User"("activeBranchId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureModule_code_key" ON "FeatureModule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "TenantFeatureFlag_tenantId_enabled_idx" ON "TenantFeatureFlag"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeatureFlag_tenantId_moduleCode_key" ON "TenantFeatureFlag"("tenantId", "moduleCode");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_userId_createdAt_idx" ON "Notification"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_readAt_createdAt_idx" ON "Notification"("tenantId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_tenantId_key" ON "BillingCustomer"("tenantId");

-- CreateIndex
CREATE INDEX "BillingCustomer_provider_externalCustomerId_idx" ON "BillingCustomer"("provider", "externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_externalInvoiceId_key" ON "BillingInvoice"("externalInvoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_issuedAt_idx" ON "BillingInvoice"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_status_issuedAt_idx" ON "BillingInvoice"("tenantId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_subscriptionId_issuedAt_idx" ON "BillingInvoice"("subscriptionId", "issuedAt");

-- CreateIndex
CREATE INDEX "UserSession_tenantId_userId_createdAt_idx" ON "UserSession"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorTenantId_createdAt_idx" ON "audit_logs"("actorTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetTenantId_createdAt_idx" ON "audit_logs"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_branchId_createdAt_idx" ON "audit_logs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_branchId_createdAt_idx" ON "audit_logs"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorRole_createdAt_idx" ON "audit_logs"("actorRole", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorScope_createdAt_idx" ON "audit_logs"("actorScope", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_domain_createdAt_idx" ON "audit_logs"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_email_createdAt_idx" ON "audit_logs"("email", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_createdAt_idx" ON "audit_logs"("correlationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_route_method_createdAt_idx" ON "audit_logs"("route", "method", "createdAt");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_branchId_idx" ON "MasterWorkflow"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_workflowType_status_idx" ON "MasterWorkflow"("tenantId", "workflowType", "status");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_employeeId_idx" ON "MasterWorkflow"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_candidateId_idx" ON "MasterWorkflow"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_currentStageKey_idx" ON "MasterWorkflow"("tenantId", "currentStageKey");

-- CreateIndex
CREATE INDEX "MasterWorkflow_tenantId_branchId_slaStatus_idx" ON "MasterWorkflow"("tenantId", "branchId", "slaStatus");

-- CreateIndex
CREATE INDEX "WorkflowStep_tenantId_branchId_status_idx" ON "WorkflowStep"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_stepType_idx" ON "WorkflowStep"("workflowId", "stepType");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_stageKey_idx" ON "WorkflowStep"("workflowId", "stageKey");

-- CreateIndex
CREATE INDEX "WorkflowStep_tenantId_riskStatus_dueDate_idx" ON "WorkflowStep"("tenantId", "riskStatus", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stageKey_key" ON "WorkflowStep"("workflowId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "HiringFlow_workflowId_key" ON "HiringFlow"("workflowId");

-- CreateIndex
CREATE INDEX "HiringFlow_tenantId_branchId_status_idx" ON "HiringFlow"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "HiringFlow_candidateId_idx" ON "HiringFlow"("candidateId");

-- CreateIndex
CREATE INDEX "HiringFlow_employeeId_idx" ON "HiringFlow"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingFlow_workflowId_key" ON "OnboardingFlow"("workflowId");

-- CreateIndex
CREATE INDEX "OnboardingFlow_tenantId_branchId_status_idx" ON "OnboardingFlow"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "OnboardingFlow_employeeId_idx" ON "OnboardingFlow"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingTask_tenantId_branchId_status_idx" ON "OnboardingTask"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "OnboardingTask_workflowId_taskType_idx" ON "OnboardingTask"("workflowId", "taskType");

-- CreateIndex
CREATE INDEX "SignaturePackage_tenantId_branchId_status_idx" ON "SignaturePackage"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "SignaturePackage_workflowId_idx" ON "SignaturePackage"("workflowId");

-- CreateIndex
CREATE INDEX "SignatureParticipant_tenantId_status_idx" ON "SignatureParticipant"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SignatureParticipant_packageId_idx" ON "SignatureParticipant"("packageId");

-- CreateIndex
CREATE INDEX "InventoryAssignment_tenantId_branchId_status_idx" ON "InventoryAssignment"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "InventoryAssignment_workflowId_idx" ON "InventoryAssignment"("workflowId");

-- CreateIndex
CREATE INDEX "InventoryAssignment_employeeId_idx" ON "InventoryAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "InventoryRecovery_tenantId_branchId_status_idx" ON "InventoryRecovery"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "InventoryRecovery_workflowId_idx" ON "InventoryRecovery"("workflowId");

-- CreateIndex
CREATE INDEX "InventoryRecovery_employeeId_idx" ON "InventoryRecovery"("employeeId");

-- CreateIndex
CREATE INDEX "WorkflowTrainingAssignment_tenantId_branchId_status_idx" ON "WorkflowTrainingAssignment"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "WorkflowTrainingAssignment_workflowId_idx" ON "WorkflowTrainingAssignment"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowTrainingAssignment_employeeId_idx" ON "WorkflowTrainingAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "AccessTask_tenantId_branchId_status_idx" ON "AccessTask"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "AccessTask_workflowId_taskType_idx" ON "AccessTask"("workflowId", "taskType");

-- CreateIndex
CREATE INDEX "AccessTask_employeeId_idx" ON "AccessTask"("employeeId");

-- CreateIndex
CREATE INDEX "ProductivityReview_tenantId_branchId_status_idx" ON "ProductivityReview"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "ProductivityReview_workflowId_idx" ON "ProductivityReview"("workflowId");

-- CreateIndex
CREATE INDEX "ProductivityReview_employeeId_idx" ON "ProductivityReview"("employeeId");

-- CreateIndex
CREATE INDEX "OperationalEvent_tenantId_branchId_eventType_idx" ON "OperationalEvent"("tenantId", "branchId", "eventType");

-- CreateIndex
CREATE INDEX "OperationalEvent_workflowId_occurredAt_idx" ON "OperationalEvent"("workflowId", "occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_correlationId_occurredAt_idx" ON "OperationalEvent"("correlationId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowBlocker_tenantId_branchId_resolvedAt_idx" ON "WorkflowBlocker"("tenantId", "branchId", "resolvedAt");

-- CreateIndex
CREATE INDEX "WorkflowBlocker_workflowId_stepKey_resolvedAt_idx" ON "WorkflowBlocker"("workflowId", "stepKey", "resolvedAt");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_name_key" ON "Branch"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_status_idx" ON "Employee"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_email_key" ON "Employee"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmployeeBranch_tenantId_employeeId_idx" ON "EmployeeBranch"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBranch_tenantId_branchId_idx" ON "EmployeeBranch"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "EmployeeBranch_tenantId_branchId_releasedAt_idx" ON "EmployeeBranch"("tenantId", "branchId", "releasedAt");

-- CreateIndex
CREATE INDEX "EmployeeBranch_tenantId_employeeId_releasedAt_idx" ON "EmployeeBranch"("tenantId", "employeeId", "releasedAt");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "InventoryStock_tenantId_branchId_idx" ON "InventoryStock"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "InventoryStock_tenantId_itemId_idx" ON "InventoryStock"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_itemId_branchId_key" ON "InventoryStock"("itemId", "branchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");

-- CreateIndex
CREATE INDEX "Vacancy_tenantId_idx" ON "Vacancy"("tenantId");

-- CreateIndex
CREATE INDEX "Vacancy_tenantId_branchId_idx" ON "Vacancy"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Vacancy_tenantId_branchId_status_idx" ON "Vacancy"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Vacancy_tenantId_createdByUserId_idx" ON "Vacancy"("tenantId", "createdByUserId");

-- CreateIndex
CREATE INDEX "VacancyFormTemplate_tenantId_idx" ON "VacancyFormTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyFormTemplate_tenantId_name_key" ON "VacancyFormTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_tenantId_email_key" ON "Candidate"("tenantId", "email");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_enabled_triggerEvent_idx" ON "AutomationRule"("tenantId", "enabled", "triggerEvent");

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_branchId_enabled_idx" ON "AutomationRule"("tenantId", "branchId", "enabled");

-- CreateIndex
CREATE INDEX "AutomationExecution_tenantId_createdAt_idx" ON "AutomationExecution"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_tenantId_branchId_createdAt_idx" ON "AutomationExecution"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_tenantId_triggerEvent_status_idx" ON "AutomationExecution"("tenantId", "triggerEvent", "status");

-- CreateIndex
CREATE INDEX "AutomationExecution_workflowId_createdAt_idx" ON "AutomationExecution"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_employeeId_createdAt_idx" ON "AutomationExecution"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecutionStep_tenantId_createdAt_idx" ON "AutomationExecutionStep"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecutionStep_tenantId_branchId_createdAt_idx" ON "AutomationExecutionStep"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecutionStep_executionId_createdAt_idx" ON "AutomationExecutionStep"("executionId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationAuditLog_tenantId_occurredAt_idx" ON "AutomationAuditLog"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "AutomationAuditLog_tenantId_branchId_occurredAt_idx" ON "AutomationAuditLog"("tenantId", "branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "AutomationAuditLog_executionId_occurredAt_idx" ON "AutomationAuditLog"("executionId", "occurredAt");

-- CreateIndex
CREATE INDEX "AutomationAuditLog_workflowId_occurredAt_idx" ON "AutomationAuditLog"("workflowId", "occurredAt");

-- CreateIndex
CREATE INDEX "PolicyCheck_tenantId_status_createdAt_idx" ON "PolicyCheck"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyCheck_workflowId_createdAt_idx" ON "PolicyCheck"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyCheck_employeeId_createdAt_idx" ON "PolicyCheck"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_tenantId_status_createdAt_idx" ON "AssetAssignment"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_workflowId_createdAt_idx" ON "AssetAssignment"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_createdAt_idx" ON "AssetAssignment"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingActivation_tenantId_status_createdAt_idx" ON "TrainingActivation"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingActivation_workflowId_createdAt_idx" ON "TrainingActivation"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingActivation_employeeId_createdAt_idx" ON "TrainingActivation"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "VacancyApplication_tenantId_status_idx" ON "VacancyApplication"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VacancyApplication_tenantId_vacancyId_idx" ON "VacancyApplication"("tenantId", "vacancyId");

-- CreateIndex
CREATE INDEX "VacancyApplication_candidateId_idx" ON "VacancyApplication"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyApplication_vacancyId_candidateId_key" ON "VacancyApplication"("vacancyId", "candidateId");

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_applicationId_idx" ON "ApplicationTimelineEvent"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_type_idx" ON "ApplicationTimelineEvent"("type");

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_occurredAt_idx" ON "ApplicationTimelineEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_tenantId_enabled_idx" ON "TenantTrainingModuleAccess"("tenantId", "enabled");

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_subscriptionId_idx" ON "TenantTrainingModuleAccess"("subscriptionId");

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_planId_idx" ON "TenantTrainingModuleAccess"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTrainingModuleAccess_tenantId_key" ON "TenantTrainingModuleAccess"("tenantId");

-- CreateIndex
CREATE INDEX "TrainingCategory_tenantId_isActive_idx" ON "TrainingCategory"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TrainingCategory_parentCategoryId_idx" ON "TrainingCategory"("parentCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCategory_tenantId_slug_key" ON "TrainingCategory"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCurriculum_tenantId_isPublished_idx" ON "TrainingCurriculum"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingCurriculum_categoryId_idx" ON "TrainingCurriculum"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCurriculum_tenantId_slug_key" ON "TrainingCurriculum"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCourse_tenantId_isPublished_idx" ON "TrainingCourse"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingCourse_curriculumId_idx" ON "TrainingCourse"("curriculumId");

-- CreateIndex
CREATE INDEX "TrainingCourse_categoryId_idx" ON "TrainingCourse"("categoryId");

-- CreateIndex
CREATE INDEX "TrainingCourse_type_idx" ON "TrainingCourse"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_tenantId_slug_key" ON "TrainingCourse"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCourseStep_courseId_sortOrder_idx" ON "TrainingCourseStep"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_userId_status_idx" ON "TrainingAssignment"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_dueAt_idx" ON "TrainingAssignment"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_startAt_idx" ON "TrainingAssignment"("tenantId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_tenantId_userId_curriculumId_key" ON "TrainingAssignment"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_tenantId_userId_courseId_key" ON "TrainingAssignment"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingProgress_tenantId_userId_status_idx" ON "TrainingProgress"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingProgress_tenantId_lastActivityAt_idx" ON "TrainingProgress"("tenantId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_tenantId_userId_curriculumId_key" ON "TrainingProgress"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_tenantId_userId_courseId_key" ON "TrainingProgress"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingStepProgress_tenantId_userId_idx" ON "TrainingStepProgress"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingStepProgress_userId_courseStepId_key" ON "TrainingStepProgress"("userId", "courseStepId");

-- CreateIndex
CREATE INDEX "TrainingEvent_tenantId_startsAt_idx" ON "TrainingEvent"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "TrainingEvent_relatedCourseId_idx" ON "TrainingEvent"("relatedCourseId");

-- CreateIndex
CREATE INDEX "TrainingEvent_relatedCurriculumId_idx" ON "TrainingEvent"("relatedCurriculumId");

-- CreateIndex
CREATE INDEX "TrainingEventAttendance_eventId_status_idx" ON "TrainingEventAttendance"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingEventAttendance_eventId_userId_key" ON "TrainingEventAttendance"("eventId", "userId");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_tenantId_isPublished_idx" ON "TrainingLibraryResource"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_tenantId_isFeatured_idx" ON "TrainingLibraryResource"("tenantId", "isFeatured");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_categoryId_idx" ON "TrainingLibraryResource"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLibraryResource_tenantId_slug_key" ON "TrainingLibraryResource"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingQuiz_courseId_idx" ON "TrainingQuiz"("courseId");

-- CreateIndex
CREATE INDEX "TrainingQuizQuestion_quizId_sortOrder_idx" ON "TrainingQuizQuestion"("quizId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingQuizOption_questionId_sortOrder_idx" ON "TrainingQuizOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingQuizAttempt_tenantId_userId_status_idx" ON "TrainingQuizAttempt"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingQuizAttempt_quizId_idx" ON "TrainingQuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "TrainingQuizAnswer_attemptId_idx" ON "TrainingQuizAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingQuizAnswer_attemptId_questionId_key" ON "TrainingQuizAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "TrainingCertificate_tenantId_userId_issuedAt_idx" ON "TrainingCertificate"("tenantId", "userId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCertificate_tenantId_userId_curriculumId_key" ON "TrainingCertificate"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCertificate_tenantId_userId_courseId_key" ON "TrainingCertificate"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingFavorite_tenantId_userId_entityType_idx" ON "TrainingFavorite"("tenantId", "userId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_courseId_key" ON "TrainingFavorite"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_curriculumId_key" ON "TrainingFavorite"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_libraryResourceId_key" ON "TrainingFavorite"("tenantId", "userId", "libraryResourceId");

-- CreateIndex
CREATE INDEX "TrainingAnalyticsSnapshot_tenantId_userId_generatedAt_idx" ON "TrainingAnalyticsSnapshot"("tenantId", "userId", "generatedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeBranchId_fkey" FOREIGN KEY ("activeBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "FeatureModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureFlag" ADD CONSTRAINT "TenantFeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWorkflow" ADD CONSTRAINT "MasterWorkflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWorkflow" ADD CONSTRAINT "MasterWorkflow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWorkflow" ADD CONSTRAINT "MasterWorkflow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWorkflow" ADD CONSTRAINT "MasterWorkflow_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWorkflow" ADD CONSTRAINT "MasterWorkflow_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringFlow" ADD CONSTRAINT "HiringFlow_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_onboardingFlowId_fkey" FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureParticipant" ADD CONSTRAINT "SignatureParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureParticipant" ADD CONSTRAINT "SignatureParticipant_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SignaturePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAssignment" ADD CONSTRAINT "InventoryAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAssignment" ADD CONSTRAINT "InventoryAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAssignment" ADD CONSTRAINT "InventoryAssignment_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAssignment" ADD CONSTRAINT "InventoryAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAssignment" ADD CONSTRAINT "InventoryAssignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecovery" ADD CONSTRAINT "InventoryRecovery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecovery" ADD CONSTRAINT "InventoryRecovery_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecovery" ADD CONSTRAINT "InventoryRecovery_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecovery" ADD CONSTRAINT "InventoryRecovery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecovery" ADD CONSTRAINT "InventoryRecovery_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTrainingAssignment" ADD CONSTRAINT "WorkflowTrainingAssignment_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessTask" ADD CONSTRAINT "AccessTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessTask" ADD CONSTRAINT "AccessTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessTask" ADD CONSTRAINT "AccessTask_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessTask" ADD CONSTRAINT "AccessTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityReview" ADD CONSTRAINT "ProductivityReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityReview" ADD CONSTRAINT "ProductivityReview_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityReview" ADD CONSTRAINT "ProductivityReview_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityReview" ADD CONSTRAINT "ProductivityReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityReview" ADD CONSTRAINT "ProductivityReview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowBlocker" ADD CONSTRAINT "WorkflowBlocker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowBlocker" ADD CONSTRAINT "WorkflowBlocker_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowBlocker" ADD CONSTRAINT "WorkflowBlocker_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBranch" ADD CONSTRAINT "EmployeeBranch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBranch" ADD CONSTRAINT "EmployeeBranch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBranch" ADD CONSTRAINT "EmployeeBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyFormTemplate" ADD CONSTRAINT "VacancyFormTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationExecutionStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationExecutionStep_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationExecutionStep_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationAuditLog" ADD CONSTRAINT "AutomationAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheck" ADD CONSTRAINT "PolicyCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheck" ADD CONSTRAINT "PolicyCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheck" ADD CONSTRAINT "PolicyCheck_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheck" ADD CONSTRAINT "PolicyCheck_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCheck" ADD CONSTRAINT "PolicyCheck_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_inventoryAssignmentId_fkey" FOREIGN KEY ("inventoryAssignmentId") REFERENCES "InventoryAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_workflowTrainingAssignmentId_fkey" FOREIGN KEY ("workflowTrainingAssignmentId") REFERENCES "WorkflowTrainingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActivation" ADD CONSTRAINT "TrainingActivation_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyApplication" ADD CONSTRAINT "VacancyApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyApplication" ADD CONSTRAINT "VacancyApplication_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyApplication" ADD CONSTRAINT "VacancyApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTimelineEvent" ADD CONSTRAINT "ApplicationTimelineEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCategory" ADD CONSTRAINT "TrainingCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCategory" ADD CONSTRAINT "TrainingCategory_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCurriculum" ADD CONSTRAINT "TrainingCurriculum_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCurriculum" ADD CONSTRAINT "TrainingCurriculum_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourseStep" ADD CONSTRAINT "TrainingCourseStep_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_courseStepId_fkey" FOREIGN KEY ("courseStepId") REFERENCES "TrainingCourseStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_relatedCourseId_fkey" FOREIGN KEY ("relatedCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_relatedCurriculumId_fkey" FOREIGN KEY ("relatedCurriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEventAttendance" ADD CONSTRAINT "TrainingEventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TrainingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEventAttendance" ADD CONSTRAINT "TrainingEventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLibraryResource" ADD CONSTRAINT "TrainingLibraryResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLibraryResource" ADD CONSTRAINT "TrainingLibraryResource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizQuestion" ADD CONSTRAINT "TrainingQuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizOption" ADD CONSTRAINT "TrainingQuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TrainingQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TrainingQuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TrainingQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "TrainingQuizOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_libraryResourceId_fkey" FOREIGN KEY ("libraryResourceId") REFERENCES "TrainingLibraryResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalyticsSnapshot" ADD CONSTRAINT "TrainingAnalyticsSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalyticsSnapshot" ADD CONSTRAINT "TrainingAnalyticsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

