import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AutomationService } from '../src/automation/automation.service';
import { AccessScope } from '../src/common/enums/access-scope.enum';
import { JwtPayload } from '../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RoleScope } from '../src/common/enums/role-scope.enum';
import { SubscriptionAccessState } from '../src/common/auth/subscription-access-state.enum';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);
    const automationService = app.get(AutomationService);

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'talentos-cloud-usa' },
    });
    const branch = await prisma.branch.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });
    const user = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, email: 'ava.thompson@talentoscloud.com' },
    });
    const candidate = await prisma.candidate.findFirstOrThrow({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });

    const actor: JwtPayload = {
      sub: user.id,
      userId: user.id,
      tenantId: tenant.id,
      allowedTenantIds: [tenant.id],
      activeTenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: 'TENANT_ADMIN',
      scope: AccessScope.TENANT,
      isSuperAdmin: false,
      roleScope: RoleScope.TENANT_ADMIN,
      allowedBranchIds: [branch.id],
      activeBranchId: branch.id,
      roles: ['TENANT_ADMIN'],
      permissions: ['applications.update', 'employees.update', 'training.update', 'domain_events.create'],
      enabledModules: [],
      isGlobalContext: false,
      impersonation: {
        active: false,
        tenantId: null,
        startedAt: null,
        reason: null,
      },
      subscriptionStatus: SubscriptionAccessState.ACTIVE,
      subscriptionGraceEndsAt: null,
    };

    const hired = await automationService.processCandidateHired(actor, {
      branchId: branch.id,
      candidateId: candidate.id,
      employeeName: candidate.fullName,
      employeeEmail: `automation.${Date.now()}@example.com`,
      payload: { source: 'integration-script' },
    });

    const workflow = await prisma.masterWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        candidateId: candidate.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    await automationService.processOnboardingCompleted(actor, {
      branchId: branch.id,
      employeeId: workflow.employeeId!,
      workflowId: workflow.id,
      payload: { step: 'onboarding' },
    });

    await automationService.processTrainingCompleted(actor, {
      branchId: branch.id,
      employeeId: workflow.employeeId!,
      workflowId: workflow.id,
      payload: { step: 'training' },
    });

    await automationService.processOperationHandoffCompleted(actor, {
      branchId: branch.id,
      employeeId: workflow.employeeId!,
      workflowId: workflow.id,
      payload: { step: 'operation' },
    });

    const closed = await automationService.processComplianceClosed(actor, {
      branchId: branch.id,
      employeeId: workflow.employeeId!,
      workflowId: workflow.id,
      payload: { step: 'compliance' },
    });

    const refreshed = await prisma.masterWorkflow.findUniqueOrThrow({
      where: { id: workflow.id },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        currentStageKey: true,
        blockersSnapshot: true,
        lastEventAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          candidateHiredExecutions: hired.executionCount,
          complianceExecutions: closed.executionCount,
          workflow: refreshed,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
