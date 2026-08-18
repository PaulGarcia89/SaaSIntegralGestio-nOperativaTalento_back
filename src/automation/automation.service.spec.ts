import {
  AutomationConsequenceType,
  AutomationScope,
  AutomationTriggerEvent,
  Prisma,
} from '@prisma/client';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AutomationService } from './automation.service';

const actor = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  roleScope: 'tenant_admin',
  isSuperAdmin: false,
  allowedBranchIds: [],
  activeBranchId: null,
} as unknown as JwtPayload;

const rule = {
  id: 'rule-1',
  tenantId: 'tenant-1',
  branchId: null,
  name: 'Preparar incorporación',
  triggerEvent: AutomationTriggerEvent.CANDIDATE_HIRED,
  scope: AutomationScope.TENANT,
  conditions: [{ field: 'payload.jobTitle', operator: 'equals', value: 'Analista' }] as Prisma.JsonValue,
  consequences: [{ type: AutomationConsequenceType.NOTIFY_ACTOR, title: 'Nueva contratación' }] as Prisma.JsonValue,
  enabled: true,
  version: 2,
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AutomationService no-code governance', () => {
  const prisma = {
    automationRule: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    automationExecution: { count: jest.fn(), groupBy: jest.fn() },
    $transaction: jest.fn(),
  };
  const workflows = {};
  let service: AutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
    service = new AutomationService(prisma as never, workflows as never, {} as never);
  });

  it('simulates conditions without creating executions or audit records', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(rule);

    const result = await service.simulateRule(actor, rule.id, {
      payload: { jobTitle: 'Analista' },
    });

    expect(result.matched).toBe(true);
    expect(result.willExecute).toBe(true);
    expect(prisma.automationRule.findFirst).toHaveBeenCalledWith({
      where: { id: rule.id, tenantId: actor.tenantId },
    });
    expect(prisma.automationRule.create).not.toHaveBeenCalled();
    expect(prisma.automationRule.update).not.toHaveBeenCalled();
  });

  it('duplicates a rule as a disabled version-one draft', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(rule);
    prisma.automationRule.create.mockResolvedValue({ id: 'rule-copy' });

    await service.duplicateRule(actor, rule.id);

    expect(prisma.automationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        name: 'Preparar incorporación (copia)',
        enabled: false,
        version: 1,
        createdBy: actor.sub,
      }),
    });
  });

  it('preserves executed rules by disabling instead of deleting them', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(rule);
    prisma.automationExecution.count.mockResolvedValue(3);
    prisma.automationRule.update.mockResolvedValue({ ...rule, enabled: false });

    const result = await service.deleteRule(actor, rule.id);

    expect(result).toEqual(expect.objectContaining({ deleted: false, disabled: true }));
    expect(prisma.automationRule.update).toHaveBeenCalledWith({
      where: { id: rule.id },
      data: { enabled: false },
    });
    expect(prisma.automationRule.delete).not.toHaveBeenCalled();
  });

  it('updates up to a verified set of rules in one bulk operation', async () => {
    const ids = ['e3a9e1bf-9099-4c5f-a506-85a3b98de201', 'e3a9e1bf-9099-4c5f-a506-85a3b98de202'];
    prisma.automationRule.findMany.mockResolvedValue(ids.map((id) => ({ id })));
    prisma.automationRule.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.bulkRules(actor, { ids, action: 'DISABLE' });

    expect(result).toEqual({ requested: 2, updated: 2, deleted: 0, preserved: 0 });
    expect(prisma.automationRule.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tenantId: actor.tenantId },
      data: { enabled: false },
    });
  });

  it('deletes drafts but preserves rules with execution history during bulk deletion', async () => {
    const draftId = 'e3a9e1bf-9099-4c5f-a506-85a3b98de203';
    const executedId = 'e3a9e1bf-9099-4c5f-a506-85a3b98de204';
    prisma.automationRule.findMany.mockResolvedValue([{ id: draftId }, { id: executedId }]);
    prisma.automationExecution.groupBy.mockResolvedValue([{ ruleId: executedId, _count: { _all: 4 } }]);
    prisma.automationRule.updateMany.mockResolvedValue({ count: 1 });
    prisma.automationRule.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.bulkRules(actor, { ids: [draftId, executedId], action: 'DELETE' });

    expect(result).toEqual({ requested: 2, updated: 1, deleted: 1, preserved: 1 });
    expect(prisma.automationRule.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [draftId] } } });
  });
});
