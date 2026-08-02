import { BadRequestException } from '@nestjs/common';
import { PersonnelRequisitionStatus } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PersonnelRequisitionsService } from './personnel-requisitions.service';

describe('PersonnelRequisitionsService', () => {
  const tx = {
    personnelRequisition: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    personnelRequisitionLocation: { createMany: jest.fn() },
    personnelRequisitionApproval: {
      createMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const prisma = {
    branch: { count: jest.fn() },
    user: { count: jest.fn() },
    personnelRequisition: { findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const actor = {
    sub: '0f8fad5b-d9cb-469f-a165-70867728950e',
    tenantId: 'tenant-1',
    scope: AccessScope.TENANT,
    allowedBranchIds: ['branch-1'],
    isSuperAdmin: false,
  } as JwtPayload;
  const service = new PersonnelRequisitionsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.branch.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(1);
    tx.personnelRequisition.create.mockResolvedValue({ id: 'requisition-1' });
    tx.personnelRequisition.findUniqueOrThrow.mockResolvedValue({ id: 'requisition-1', status: 'PENDING_APPROVAL' });
  });

  it('creates headcount and budget approval assignments atomically', async () => {
    await service.create('tenant-1', actor, {
      title: 'Operations coordinator',
      justification: 'Approved expansion plan',
      openings: 2,
      budgetMin: 3000,
      budgetMax: 4500,
      currency: 'usd',
      branchIds: ['branch-1'],
      approverUserIds: ['6fa459ea-ee8a-3ca4-894e-db77e160355e'],
      status: PersonnelRequisitionStatus.PENDING_APPROVAL,
    });

    expect(tx.personnelRequisitionLocation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ branchId: 'branch-1', isPrimary: true })],
    });
    expect(tx.personnelRequisitionApproval.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ approverUserId: '6fa459ea-ee8a-3ca4-894e-db77e160355e' })],
    });
  });

  it('requires a reason when rejecting headcount', async () => {
    prisma.personnelRequisition.findFirst.mockResolvedValue({
      id: 'requisition-1',
      status: PersonnelRequisitionStatus.PENDING_APPROVAL,
      approvals: [{ id: 'approval-1', approverUserId: actor.sub }],
    });

    await expect(service.decide('requisition-1', 'tenant-1', actor, false)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approves the requisition only after every approver accepts', async () => {
    prisma.personnelRequisition.findFirst.mockResolvedValue({
      id: 'requisition-1',
      status: PersonnelRequisitionStatus.PENDING_APPROVAL,
      approvals: [{ id: 'approval-1', approverUserId: actor.sub }],
    });
    tx.personnelRequisitionApproval.findMany.mockResolvedValue([
      { status: 'APPROVED' },
      { status: 'APPROVED' },
    ]);

    await service.decide('requisition-1', 'tenant-1', actor, true, 'Budget confirmed');

    expect(tx.personnelRequisition.update).toHaveBeenCalledWith({
      where: { id: 'requisition-1' },
      data: expect.objectContaining({ status: PersonnelRequisitionStatus.APPROVED }),
    });
  });
});
