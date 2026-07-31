import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkflowTaskStatus } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { OnboardingService } from './onboarding.service';

const tenantId = 'tenant-1';
const branchId = 'branch-1';
const actor = {
  sub: 'user-1',
  tenantId,
  activeTenantId: tenantId,
  scope: AccessScope.BRANCH,
  allowedBranchIds: [branchId],
  isSuperAdmin: false,
} as any;

function serviceWith(prisma: Record<string, unknown>) {
  return new OnboardingService(
    prisma as any,
    { delete: jest.fn(), read: jest.fn(), store: jest.fn() } as any,
    { scan: jest.fn() } as any,
    { assignForOnboarding: jest.fn() } as any,
  );
}

describe('OnboardingService P1 rules', () => {
  it('does not close an expediente while required work is pending', async () => {
    const transaction = jest.fn();
    const service = serviceWith({
      onboardingFlow: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'flow-1', tenantId, branchId, workflowId: 'workflow-1',
          tasks: [{ title: 'Documentos', required: true, status: WorkflowTaskStatus.PENDING }],
          documents: [], signaturePackages: [],
        }),
      },
      $transaction: transaction,
    });

    await expect(service.completeFlow(tenantId, 'flow-1', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('closes a reviewed expediente explicitly and records the actor', async () => {
    const update = jest.fn().mockResolvedValue({});
    const eventCreate = jest.fn().mockResolvedValue({});
    const flow = {
      id: 'flow-1', tenantId, branchId, workflowId: 'workflow-1',
      tasks: [{ title: 'Documentos', required: true, status: WorkflowTaskStatus.COMPLETED }],
      documents: [{ originalName: 'contrato.pdf', status: 'APPROVED', expiresAt: null }],
      signaturePackages: [{ title: 'Contrato', status: 'COMPLETED' }],
    };
    const prisma = {
      onboardingFlow: { findFirst: jest.fn().mockResolvedValue(flow), update },
      operationalEvent: { create: eventCreate },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback({ onboardingFlow: { update }, operationalEvent: { create: eventCreate } })),
    };
    const service = serviceWith(prisma);
    jest.spyOn(service, 'getFlow').mockResolvedValue({ id: 'flow-1' } as any);

    await service.completeFlow(tenantId, 'flow-1', actor);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'flow-1' },
      data: expect.objectContaining({ status: WorkflowTaskStatus.COMPLETED, readinessStatus: 'READY' }),
    }));
    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: actor.sub }),
    }));
  });

  it('requires a personalized reason when a document is rejected', async () => {
    const service = serviceWith({
      employeeDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1', tenantId, branchId, scanStatus: 'CLEAN', deletedAt: null,
          onboardingFlow: { workflowId: 'workflow-1' },
        }),
      },
    });

    await expect(service.reviewDocument(tenantId, actor, 'document-1', { status: 'REJECTED' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects direct task mutation outside the actor branch', async () => {
    const transaction = jest.fn();
    const service = serviceWith({
      onboardingTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1', tenantId, branchId: 'branch-2', status: WorkflowTaskStatus.PENDING,
          onboardingFlow: { tasks: [] }, documents: [],
        }),
      },
      $transaction: transaction,
    });

    await expect(service.updateTask(tenantId, 'task-1', actor, { title: 'No permitido' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
