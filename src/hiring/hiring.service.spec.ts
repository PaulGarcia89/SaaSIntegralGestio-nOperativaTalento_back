import { HiringService } from './hiring.service';
import { ModuleCode } from '@prisma/client';
import { HiringProgressResolver } from './hiring-progress.resolver';

describe('HiringService', () => {
  it('compiles', () => {
    expect(HiringService).toBeDefined();
  });

  it('calculates guided progress from the persisted status', () => {
    const service = new HiringService({} as never, {} as never, {} as never, new HiringProgressResolver());
    const progress = new HiringProgressResolver().resolve({ status: 'DOCUMENTS_PENDING', currentStage: 'documents_pending', nextAction: null, nextActor: null });

    expect(progress.currentStage).toBe('documents_pending');
    expect(progress.progressPercent).toBe(63);
    expect(progress.tasksPending).toEqual(['Firmas pendientes', 'Revisión de cumplimiento', 'Contratado']);
    expect(progress.actorResponsible).toBe('HR');
    expect(progress.displayStatus).toBe('Documentos pendientes');
    expect(progress.nextAction.code).toBe('REVIEW_DOCUMENTS');
    expect(progress.requiredDocumentsSummary).toEqual({ total: 0, completed: 0, pending: 0, blocked: false });
  });

  it('reuses an existing employee and starts onboarding once when the module is enabled', async () => {
    const tx = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }), create: jest.fn() },
      hiringContractDocument: { findMany: jest.fn().mockResolvedValue([]) },
      onboardingTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      masterWorkflow: { create: jest.fn().mockResolvedValue({ id: 'workflow-1' }) },
      onboardingFlow: { create: jest.fn().mockResolvedValue({ id: 'onboarding-1' }) },
      onboardingTask: { createMany: jest.fn() },
      hiringContract: { update: jest.fn().mockResolvedValue({ id: 'contract-1', status: 'HIRED' }) },
      hiringContractStateEvent: { create: jest.fn() },
    };
    const prisma = {
      hiringContractDocument: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any;
    const service = new HiringService(prisma, {} as any, {} as any, new HiringProgressResolver());
    const contract = {
      id: 'contract-1', tenantId: 'tenant-1', candidateId: 'candidate-1', applicationId: 'application-1', branchId: 'branch-1',
      roleTitle: 'Analista', status: 'OFFER_ACCEPTED', isActive: true, onboardingFlowId: null,
      application: { vacancy: { title: 'Analista' } },
    };
    jest.spyOn(service as any, 'mustGet').mockResolvedValue(contract);

    await service.confirm('tenant-1', { sub: 'user-1', role: 'HR', enabledModules: [ModuleCode.ONBOARDING] } as any, 'contract-1');

    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(tx.masterWorkflow.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ hiringContractId: 'contract-1' }) }) }));
    expect(tx.onboardingFlow.create).toHaveBeenCalled();
    expect(tx.hiringContract.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ employeeId: 'employee-1', onboardingFlowId: 'onboarding-1', status: 'HIRED' }) }));
  });

  it('blocks confirmation when required documents are pending', async () => {
    const prisma = { hiringContractDocument: { count: jest.fn().mockResolvedValue(1) }, $transaction: jest.fn() } as any;
    const service = new HiringService(prisma, {} as any, {} as any, new HiringProgressResolver());
    jest.spyOn(service as any, 'mustGet').mockResolvedValue({ status: 'OFFER_ACCEPTED', isActive: true });

    await expect(service.confirm('tenant-1', { sub: 'user-1' } as any, 'contract-1')).rejects.toThrow('faltan documentos obligatorios');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
