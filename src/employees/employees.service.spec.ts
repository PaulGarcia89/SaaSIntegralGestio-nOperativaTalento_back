import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeeStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';

describe('EmployeesService documentary records', () => {
  const tenantId = 'tenant-1';
  const branchId = '11111111-1111-4111-8111-111111111111';
  const createdAt = new Date('2026-08-19T12:00:00.000Z');

  function employeeRecord() {
    return {
      id: 'employee-1', tenantId, name: 'Ana Perez', email: 'ana@example.com',
      jobTitle: 'Supervisora', sourceCandidateId: null, status: EmployeeStatus.ACTIVE,
      createdAt, updatedAt: createdAt, branchAssignments: [], _count: { employeeDocuments: 0 },
    };
  }

  function setup() {
    const createdEmployee = employeeRecord();
    const tx = {
      employee: {
        create: jest.fn().mockResolvedValue(createdEmployee),
        update: jest.fn().mockResolvedValue(createdEmployee),
      },
      employeeBranch: { create: jest.fn(), updateMany: jest.fn() },
    };
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: branchId }),
        findMany: jest.fn().mockResolvedValue([{ id: branchId }]),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(createdEmployee),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeDocument: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((operation: ((client: typeof tx) => unknown) | unknown[]) =>
        typeof operation === 'function' ? operation(tx) : Promise.all(operation),
      ),
    } as any;
    return { service: new EmployeesService(prisma), prisma, tx };
  }

  it('registers an existing employee record and mirrors the job title on its primary branch', async () => {
    const { service, tx } = setup();
    const result = await service.register(tenantId, {
      name: '  Ana Perez  ', email: '  ANA@EXAMPLE.COM ', primaryBranchId: branchId,
      primaryRole: '  Supervisora  ', status: EmployeeStatus.ACTIVE,
    });

    expect(tx.employee.create).toHaveBeenCalledWith({
      data: { tenantId, name: 'Ana Perez', email: 'ana@example.com', jobTitle: 'Supervisora', status: EmployeeStatus.ACTIVE },
    });
    expect(tx.employeeBranch.create).toHaveBeenCalledWith({
      data: { tenantId, employeeId: 'employee-1', branchId, role: 'Supervisora', isPrimary: true },
    });
    expect(result).toMatchObject({
      recordSource: 'DIRECTORY_REGISTRATION', documentSummary: { totalDocuments: 0 },
    });
  });

  it('rejects an email already registered in the same company', async () => {
    const { service, prisma, tx } = setup();
    prisma.employee.findFirst.mockReset().mockResolvedValue({ id: 'existing' });

    await expect(service.register(tenantId, {
      name: 'Ana Perez', email: 'ana@example.com', primaryBranchId: branchId,
      primaryRole: 'Supervisora', status: EmployeeStatus.ACTIVE,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.employee.create).not.toHaveBeenCalled();
  });

  it('validates that the selected branch belongs to the active tenant before writing', async () => {
    const { service, prisma, tx } = setup();
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(service.register(tenantId, {
      name: 'Ana Perez', email: 'ana@example.com', primaryBranchId: branchId,
      primaryRole: 'Supervisora', status: EmployeeStatus.ACTIVE,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('makes the first assignment primary when an employee has none', async () => {
    const { service, prisma } = setup();
    prisma.employee.findFirst.mockReset().mockResolvedValue(employeeRecord());
    prisma.employeeBranch = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };

    await service.assignSecondaryBranch('employee-1', {} as any, tenantId, {
      branchId,
      role: 'Gerente',
    });

    expect(prisma.employeeBranch.create).toHaveBeenCalledWith({
      data: { tenantId, employeeId: 'employee-1', branchId, role: 'Gerente', isPrimary: true },
    });
  });

  it('prevalidates a bulk load and reports row-level documentary record errors', async () => {
    const { service, prisma } = setup();
    prisma.employee.findMany.mockResolvedValue([{ email: 'existing@example.com' }]);

    const result = await service.validateBulkLoad(tenantId, { employees: [
      { name: 'Ana', email: 'duplicate@example.com', primaryBranchId: branchId, primaryRole: 'Analista', status: EmployeeStatus.ACTIVE },
      { name: 'Beto', email: 'duplicate@example.com', primaryBranchId: branchId, primaryRole: 'Analista', status: EmployeeStatus.ACTIVE },
      { name: 'Carla', email: 'existing@example.com', primaryBranchId: 'branch-other-tenant', primaryRole: 'Gerente', status: EmployeeStatus.ACTIVE },
    ] });

    expect(result).toMatchObject({ total: 3, valid: 0, invalid: 3 });
    expect(result.rows[0].errors).toContain('DUPLICATE_EMAIL_IN_LOAD');
    expect(result.rows[2].errors).toEqual(expect.arrayContaining([
      'EMPLOYEE_EMAIL_ALREADY_REGISTERED', 'BRANCH_NOT_AVAILABLE_IN_TENANT',
    ]));
  });

  it('returns a safe documentary audit summary without storage identifiers', async () => {
    const { service, prisma } = setup();
    prisma.employee.findFirst.mockReset().mockResolvedValue(employeeRecord());
    prisma.employeeDocument.findMany.mockResolvedValue([{
      id: 'document-1', category: 'IDENTITY', originalName: 'identidad.pdf',
      mimeType: 'application/pdf', sizeBytes: 100, scanStatus: 'CLEAN', status: 'APPROVED',
      version: 1, rejectionReason: null, expiresAt: null, reviewedAt: createdAt, createdAt, updatedAt: createdAt,
    }]);

    const result = await service.documentSummary('employee-1', {} as any, tenantId);
    expect(result.summary).toMatchObject({ total: 1, approved: 1, byCategory: { IDENTITY: 1 } });
    expect(result.documents[0]).not.toHaveProperty('storageKey');
    expect(result.documents[0]).not.toHaveProperty('checksum');
  });

  it('builds an overview that reuses existing employee, document and audit data safely', async () => {
    const { service, prisma } = setup();
    prisma.employee.findFirst.mockReset().mockResolvedValue(employeeRecord());
    prisma.employeeDocument.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);

    const result = await service.overview('employee-1', {} as any, tenantId);

    expect(result).toMatchObject({
      employeeId: 'employee-1',
      basicInformation: {
        name: 'Ana Perez',
        email: 'ana@example.com',
        status: EmployeeStatus.ACTIVE,
        recordSource: 'DIRECTORY_REGISTRATION',
      },
      complianceSummary: {
        totalDocuments: 0,
        pendingReview: 0,
        approved: 0,
        rejected: 0,
        expired: 0,
        expiringWithin30Days: 0,
        byCategory: {},
      },
      trainingSummary: null,
      assetSummary: null,
    });
  });
});
