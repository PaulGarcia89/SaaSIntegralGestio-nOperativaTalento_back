import {
  EmployeeStatus,
  InventoryAssignmentStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { WorkflowsService } from './workflows.service';

const tenantId = 'tenant-1';
const branchId = 'branch-1';
const applicationId = 'application-1';
const candidateId = 'candidate-1';

const actor = {
  sub: 'actor-1',
  email: 'rrhh@example.test',
  tenantId,
  activeTenantId: tenantId,
  scope: 'TENANT',
  allowedBranchIds: [branchId],
  isSuperAdmin: false,
} as any;

describe('WorkflowsService hiring conversion', () => {
  it('creates the employee and starts onboarding atomically', async () => {
    const writes: Record<string, any[]> = {
      employee: [],
      employeeBranch: [],
      onboardingFlow: [],
      onboardingTask: [],
      hiringFlow: [],
      inventoryAssignment: [],
      application: [],
      vacancy: [],
    };
    const application = {
      id: applicationId,
      tenantId,
      candidateId,
      vacancyId: 'vacancy-1',
      status: 'APPROVED',
      coverLetter: 'Cover letter',
      dynamicResponses: { availability: 'Immediate' },
      candidate: {
        id: candidateId,
        fullName: 'Ana Candidate',
        email: 'ana@example.test',
        resumeUrl: 'private://candidate/resume',
      },
      vacancy: {
        id: 'vacancy-1',
        branchId,
        title: 'Operations Analyst',
        status: 'OPEN',
        openings: 1,
        stages: [{ id: 'stage-hired', applicationStatus: 'HIRED' }],
      },
    };
    const tx = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: branchId, tenantId }),
      },
      vacancyApplication: {
        findFirst: jest.fn().mockResolvedValue(application),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
        update: jest.fn(async ({ data }: any) => {
          writes.application.push(data);
          return application;
        }),
      },
      hiringFlow: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => {
          writes.hiringFlow.push(data);
          return { id: 'hiring-1', ...data };
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'supervisor-1',
          activeBranchId: branchId,
          branchAccesses: [{ branchId }],
          userRoles: [{ role: { scope: 'BRANCH' } }],
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => {
          writes.employee.push(data);
          return { id: 'employee-1', ...data };
        }),
      },
      employeeBranch: {
        create: jest.fn(async ({ data }: any) => {
          writes.employeeBranch.push(data);
          return data;
        }),
      },
      masterWorkflow: {
        create: jest.fn().mockResolvedValue({
          id: 'workflow-1',
          tenantId,
          branchId,
          employeeId: 'employee-1',
          candidateId,
        }),
      },
      onboardingTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          tasks: [
            {
              taskType: 'DOCUMENT_COLLECTION',
              taskKey: 'documents',
              title: 'Documents',
              description: null,
              ownerType: 'ROLE',
              ownerId: null,
              dueOffsetDays: 2,
              dependsOnKeys: [],
            },
          ],
        }),
      },
      onboardingFlow: {
        create: jest.fn(async ({ data }: any) => {
          writes.onboardingFlow.push(data);
          return { id: 'onboarding-1', ...data };
        }),
      },
      onboardingTask: {
        createMany: jest.fn(async ({ data }: any) => {
          writes.onboardingTask.push(...data);
          return { count: data.length };
        }),
      },
      vacancy: {
        update: jest.fn(async ({ data }: any) => {
          writes.vacancy.push(data);
          return data;
        }),
      },
      signatureTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      inventoryAssignment: {
        create: jest.fn(async ({ data }: any) => {
          writes.inventoryAssignment.push(data);
          return data;
        }),
      },
      workflowTrainingAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'training-work-1' }),
      },
      accessTask: {
        create: jest.fn().mockResolvedValue({ id: 'access-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new WorkflowsService(prisma as any);
    (service as any).createDefaultSteps = jest.fn();
    (service as any).markInitialHiringStagesComplete = jest.fn();
    (service as any).createOperationalEvent = jest.fn();
    (service as any).createAuditLog = jest.fn();
    (service as any).recomputeMasterWorkflowInTx = jest.fn();
    (service as any).loadWorkflowOrThrow = jest
      .fn()
      .mockResolvedValue({ id: 'workflow-1' });
    (service as any).assertWorkflowAccess = jest.fn();
    (service as any).serializeWorkflow = jest.fn((value: unknown) => value);

    await service.createHiringWorkflow(tenantId, actor, {
      applicationId,
      branchId,
      jobTitle: 'Operations Analyst',
      supervisorUserId: 'supervisor-1',
      onboardingTemplateId: 'template-1',
      employmentStartDate: '2026-08-03T12:00:00.000Z',
    });

    expect(writes.employee[0]).toMatchObject({
      tenantId,
      sourceCandidateId: candidateId,
      status: EmployeeStatus.ACTIVE,
      supervisorUserId: 'supervisor-1',
    });
    expect(writes.employeeBranch[0]).toMatchObject({
      employeeId: 'employee-1',
      branchId,
      isPrimary: true,
    });
    expect(writes.hiringFlow[0]).toMatchObject({
      applicationId,
      employeeId: 'employee-1',
      status: WorkflowTaskStatus.COMPLETED,
    });
    expect(writes.onboardingFlow[0]).toMatchObject({
      employeeId: 'employee-1',
      templateId: 'template-1',
      status: WorkflowTaskStatus.IN_PROGRESS,
    });
    expect(writes.onboardingTask).toHaveLength(1);
    expect(writes.inventoryAssignment[0]).toMatchObject({
      employeeId: 'employee-1',
      status: InventoryAssignmentStatus.PENDING,
    });
    expect(writes.application[0].status).toBe('HIRED');
    expect(writes.application[0].currentStage).toEqual({
      connect: { id: 'stage-hired' },
    });
    expect(writes.vacancy[0].status).toBe('FILLED');
  });

  it('returns the existing workflow without duplicating the employee', async () => {
    const employeeCreate = jest.fn();
    const tx = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: branchId, tenantId }),
      },
      vacancyApplication: {
        findFirst: jest.fn().mockResolvedValue({
          id: applicationId,
          tenantId,
          candidateId,
          vacancyId: 'vacancy-1',
          status: 'APPROVED',
          candidate: {
            id: candidateId,
            fullName: 'Ana Candidate',
            email: 'ana@example.test',
          },
          vacancy: {
            id: 'vacancy-1',
            branchId,
            status: 'OPEN',
            openings: 1,
          },
        }),
      },
      hiringFlow: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ workflowId: 'workflow-existing' }),
      },
      employee: { create: employeeCreate },
    };
    const service = new WorkflowsService({
      $transaction: async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
    } as any);
    (service as any).loadWorkflowOrThrow = jest
      .fn()
      .mockResolvedValue({ id: 'workflow-existing' });
    (service as any).assertWorkflowAccess = jest.fn();
    (service as any).serializeWorkflow = jest.fn((value: unknown) => value);

    const result = await service.createHiringWorkflow(tenantId, actor, {
      applicationId,
      branchId,
      jobTitle: 'Operations Analyst',
    });

    expect(result).toEqual({ id: 'workflow-existing' });
    expect(employeeCreate).not.toHaveBeenCalled();
  });

  it('propagates a transactional hiring rollback without loading a partial workflow', async () => {
    const rollbackError = new Error('transaction rolled back');
    const loadWorkflow = jest.fn();
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(rollbackError),
    };
    const service = new WorkflowsService(prisma as any);
    (service as any).loadWorkflowOrThrow = loadWorkflow;

    await expect(service.createHiringWorkflow(tenantId, actor, {
      applicationId,
      branchId,
      jobTitle: 'Operations Analyst',
    })).rejects.toBe(rollbackError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(loadWorkflow).not.toHaveBeenCalled();
  });
});
