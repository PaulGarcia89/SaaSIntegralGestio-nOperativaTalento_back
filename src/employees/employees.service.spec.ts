import { EmployeeStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';

describe('EmployeesService hiring entry', () => {
  const tenantId = 'tenant-1';
  const branchId = '11111111-1111-4111-8111-111111111111';

  function setup() {
    const createdEmployee = {
      id: 'employee-1',
      tenantId,
      name: 'Ana Perez',
      email: 'ana@example.com',
      jobTitle: 'Supervisora',
      status: EmployeeStatus.ACTIVE,
    };
    const tx = {
      employee: { create: jest.fn().mockResolvedValue(createdEmployee) },
      employeeBranch: { create: jest.fn() },
    };
    const prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: branchId }) },
      employee: { findFirst: jest.fn().mockResolvedValue({ ...createdEmployee, branchAssignments: [] }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    return { service: new EmployeesService(prisma), prisma, tx };
  }

  it('persists only the initial hiring data and mirrors the position as job title', async () => {
    const { service, tx } = setup();

    await service.create(tenantId, {
      name: '  Ana Perez  ',
      email: '  ANA@EXAMPLE.COM ',
      primaryBranchId: branchId,
      primaryRole: '  Supervisora  ',
      status: EmployeeStatus.ACTIVE,
    });

    expect(tx.employee.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        name: 'Ana Perez',
        email: 'ana@example.com',
        jobTitle: 'Supervisora',
        status: EmployeeStatus.ACTIVE,
      },
    });
    expect(tx.employeeBranch.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        employeeId: 'employee-1',
        branchId,
        role: 'Supervisora',
        isPrimary: true,
      },
    });
  });

  it('validates that the selected branch belongs to the active tenant before writing', async () => {
    const { service, prisma, tx } = setup();
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(
      service.create(tenantId, {
        name: 'Ana Perez',
        email: 'ana@example.com',
        primaryBranchId: branchId,
        primaryRole: 'Supervisora',
        status: EmployeeStatus.ACTIVE,
      }),
    ).rejects.toThrow('Branch not found');

    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
