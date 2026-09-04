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

describe('HiringService · puerta documental', () => {
  const actor = { sub: 'user-1', role: 'HR' } as any;

  const build = (contract: any, pendingRequired: number) => {
    const prisma = {
      hiringContract: {
        findFirst: jest.fn().mockResolvedValue(contract),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...contract, ...data })),
      },
      hiringContractDocument: { count: jest.fn().mockResolvedValue(pendingRequired) },
      hiringContractStateEvent: { create: jest.fn() },
    } as any;
    const service = new HiringService(prisma, {} as any, {} as any, new HiringProgressResolver());
    return { prisma, service };
  };

  it('abre la revisión final cuando ya no falta ningún documento obligatorio', async () => {
    const { prisma, service } = build({ id: 'c1', tenantId: 't1', status: 'DOCUMENTS_PENDING', isActive: true }, 0);

    await (service as any).syncDocumentGate('t1', 'c1', actor);

    expect(prisma.hiringContract.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLIANCE_REVIEW', currentStage: 'compliance_review', nextActor: 'HR' }),
    }));
    expect(prisma.hiringContractStateEvent.create).toHaveBeenCalled();
  });

  it('devuelve la contratación a documentos si vuelve a faltar uno', async () => {
    const { prisma, service } = build({ id: 'c1', tenantId: 't1', status: 'COMPLIANCE_REVIEW', isActive: true }, 2);

    await (service as any).syncDocumentGate('t1', 'c1', actor);

    expect(prisma.hiringContract.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DOCUMENTS_PENDING', nextActor: 'CANDIDATE' }),
    }));
  });

  it('no retrocede desde firmas: ese estado lo gobierna el proveedor de firma', async () => {
    const { prisma, service } = build({ id: 'c1', tenantId: 't1', status: 'SIGNATURES_PENDING', isActive: true }, 1);

    await (service as any).syncDocumentGate('t1', 'c1', actor);

    expect(prisma.hiringContract.update).not.toHaveBeenCalled();
  });

  it('deja intactas las contrataciones ya cerradas o canceladas', async () => {
    const cerrada = build({ id: 'c1', tenantId: 't1', status: 'HIRED', isActive: false }, 0);
    await (cerrada.service as any).syncDocumentGate('t1', 'c1', actor);
    expect(cerrada.prisma.hiringContract.update).not.toHaveBeenCalled();

    const fuera = build({ id: 'c1', tenantId: 't1', status: 'OFFER_SENT', isActive: true }, 0);
    await (fuera.service as any).syncDocumentGate('t1', 'c1', actor);
    expect(fuera.prisma.hiringContract.update).not.toHaveBeenCalled();
  });

  it('no repite la transición si ya está en el estado destino', async () => {
    const { prisma, service } = build({ id: 'c1', tenantId: 't1', status: 'COMPLIANCE_REVIEW', isActive: true }, 0);

    await (service as any).syncDocumentGate('t1', 'c1', actor);

    expect(prisma.hiringContract.update).not.toHaveBeenCalled();
  });
});
