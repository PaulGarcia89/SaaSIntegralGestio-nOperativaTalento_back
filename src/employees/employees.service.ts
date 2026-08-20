import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { SubscriptionAccessState } from '../common/auth/subscription-access-state.enum';
import { PrismaService } from '../common/prisma/prisma.service';
import { RoleScope } from '../common/enums/role-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { BulkLoadEmployeesDto } from './dto/bulk-load-employees.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { AssignEmployeeBranchDto } from './dto/assign-employee-branch.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { BulkUpdateEmployeeStatusDto } from './dto/bulk-update-employee-status.dto';
import { EmployeeSensitiveDataCryptoService } from './employee-sensitive-data-crypto.service';
import { OnboardingDocumentStorageService } from '../onboarding/onboarding-document-storage.service';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitiveCrypto: EmployeeSensitiveDataCryptoService,
    private readonly documentStorage: OnboardingDocumentStorageService,
  ) {}

  async register(tenantId: string, dto: RegisterEmployeeDto) {
    const branchId = dto.employment?.primaryBranchId ?? dto.primaryBranchId;
    const primaryRole = dto.employment?.jobTitle ?? dto.primaryRole ?? dto.name?.trim() ?? 'Empleado';
    if (!branchId) {
      throw new BadRequestException('Debes indicar la sucursal principal');
    }
    await this.assertBranchBelongsToTenant(branchId, tenantId);

    const name = (dto.personal
      ? `${dto.personal.legalFirstName} ${dto.personal.middleName ? `${dto.personal.middleName} ` : ''}${dto.personal.legalLastName}`
      : dto.name ?? '').trim();
    const email = (dto.contact?.workEmail ?? dto.email ?? '').trim().toLowerCase();
    if (!name || !email) {
      throw new BadRequestException('Debes indicar nombre y correo');
    }
    const jobTitle = primaryRole.trim();
    const employeeNumber = await this.generateEmployeeNumber(tenantId);

    const existing = await this.prisma.employee.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe un registro de empleado con este correo en la empresa');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber,
          name,
          legalFirstName: dto.personal?.legalFirstName?.trim() ?? null,
          middleName: dto.personal?.middleName?.trim() ?? null,
          legalLastName: dto.personal?.legalLastName?.trim() ?? null,
          preferredName: dto.personal?.preferredName?.trim() ?? null,
          email,
          workEmail: dto.contact?.workEmail?.trim().toLowerCase() ?? email,
          personalEmail: dto.contact?.personalEmail?.trim().toLowerCase() ?? null,
          phone: dto.contact?.phone?.trim() ?? null,
          dateOfBirth: dto.personal?.dateOfBirth ? new Date(dto.personal.dateOfBirth) : undefined,
          addressLine1: dto.contact?.addressLine1?.trim() ?? null,
          addressLine2: dto.contact?.addressLine2?.trim() ?? null,
          city: dto.contact?.city?.trim() ?? null,
          state: dto.contact?.state?.trim() ?? null,
          postalCode: dto.contact?.postalCode?.trim() ?? null,
          country: dto.contact?.country?.trim() ?? null,
          emergencyContactName: dto.emergencyContact?.name?.trim() ?? null,
          emergencyContactPhone: dto.emergencyContact?.phone?.trim() ?? null,
          emergencyContactRelationship: dto.emergencyContact?.relationship?.trim() ?? null,
          jobTitle,
          status: dto.status,
        },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: created.id,
          branchId,
          role: jobTitle,
          isPrimary: true,
        },
      });

      await tx.employeeEmploymentProfile.create({
        data: {
          tenantId,
          employeeId: created.id,
          branchId,
          department: dto.employment?.department?.trim() ?? null,
          positionId: dto.employment?.positionId?.trim() ?? null,
          supervisorUserId: dto.employment?.supervisorUserId ?? null,
          employmentType: dto.employment?.jobTitle ? 'FULL_TIME' : 'TEMPORARY',
          employmentStatus: dto.employment?.status === EmployeeStatus.ACTIVE ? 'ACTIVE' : 'DRAFT',
          hireDate: dto.employment?.hireDate ? new Date(dto.employment.hireDate) : null,
          startDate: dto.employment?.startDate ? new Date(dto.employment.startDate) : null,
          jobTitle,
          workerClassification: dto.employment?.workerClassification?.trim() ?? null,
        },
      });

      await tx.employeePayrollProfile.create({
        data: {
          tenantId,
          employeeId: created.id,
          payType: (dto.payroll?.payType as any) ?? 'SALARY',
          payRateEncrypted: dto.payroll?.payRate ? this.sensitiveCrypto.encrypt(String(dto.payroll.payRate)) : null,
          payRateLast4: dto.payroll?.payRate ? String(dto.payroll.payRate).slice(-4) : null,
          payFrequency: (dto.payroll?.payFrequency as any) ?? 'MONTHLY',
          overtimeEligible: dto.payroll?.overtimeEligible ?? null,
          regularHourlyRateEncrypted: dto.payroll?.regularHourlyRate ? this.sensitiveCrypto.encrypt(String(dto.payroll.regularHourlyRate)) : null,
          regularHourlyRateLast4: dto.payroll?.regularHourlyRate ? String(dto.payroll.regularHourlyRate).slice(-4) : null,
          workweekStartDay: dto.payroll?.workweekStartDay?.trim() ?? null,
          workweekStartTime: dto.payroll?.workweekStartTime?.trim() ?? null,
          paymentMethod: (dto.payroll?.paymentMethod as any) ?? 'OTHER',
          payrollProvider: dto.payroll?.payrollProvider?.trim() ?? null,
          payrollEmployeeId: dto.payroll?.payrollEmployeeId?.trim() ?? null,
          externalPayrollReference: dto.payroll?.externalPayrollReference?.trim() ?? null,
          effectiveFrom: dto.employment?.startDate ? new Date(dto.employment.startDate) : new Date(),
        },
      });

      await tx.employeeTaxProfile.create({
        data: {
          tenantId,
          employeeId: created.id,
          ssnEncrypted: dto.tax?.ssn ? this.sensitiveCrypto.encrypt(dto.tax.ssn.replace(/\D/g, '')) : null,
          ssnLast4: dto.tax?.ssnLast4 ?? (dto.tax?.ssn ? dto.tax.ssn.replace(/\D/g, '').slice(-4) : null),
          w4Status: (dto.tax?.w4Status as any) ?? 'PENDING',
          w2Reference: dto.tax?.w2Reference?.trim() ?? null,
          w4CompletedAt: dto.tax?.w4Status === 'COMPLETE' ? new Date() : null,
        },
      });

      await tx.employeeWorkEligibilityProfile.create({
        data: {
          tenantId,
          employeeId: created.id,
          i9Status: (dto.eligibility?.i9Status as any) ?? 'PENDING',
          firstDayOfEmployment: dto.eligibility?.firstDayOfEmployment ? new Date(dto.eligibility.firstDayOfEmployment) : null,
          reverificationRequired: dto.eligibility?.reverificationRequired ?? false,
          eVerifyRequired: dto.eligibility?.eVerifyRequired ?? false,
          eVerifyStatus: (dto.eligibility?.eVerifyStatus as any) ?? 'NOT_REQUIRED',
        },
      });

      await tx.employeeFloridaNewHireReport.create({
        data: {
          tenantId,
          employeeId: created.id,
          required: dto.floridaNewHire?.required ?? false,
          status: (dto.floridaNewHire?.status as any) ?? 'NOT_REQUIRED',
          dueDate: dto.floridaNewHire?.dueDate ? new Date(dto.floridaNewHire.dueDate) : null,
        },
      });

      const checklist = [
        { code: 'I9', title: 'Form I-9', category: 'ELIGIBILITY', required: true, status: 'PENDING' },
        { code: 'W4', title: 'Form W-4', category: 'TAX', required: true, status: 'PENDING' },
        { code: 'SSN_PAYROLL', title: 'Identidad fiscal de nómina', category: 'PAYROLL', required: true, status: 'PENDING' },
        { code: 'FL_NEW_HIRE', title: 'Florida New Hire', category: 'FLORIDA', required: false, status: 'NOT_REQUIRED' },
        { code: 'E_VERIFY', title: 'E-Verify', category: 'ELIGIBILITY', required: false, status: 'NOT_REQUIRED' },
        { code: 'EMPLOYMENT_AGREEMENT', title: 'Employment Agreement', category: 'DOCUMENT', required: true, status: 'PENDING' },
        { code: 'TRAINING_REQUIRED', title: 'Required Training', category: 'TRAINING', required: false, status: 'PENDING' },
        { code: 'PROF_LICENSE', title: 'Professional License', category: 'LICENSE', required: false, status: 'NOT_REQUIRED' },
        { code: 'SAFETY_TRAINING', title: 'Safety Training', category: 'SAFETY', required: false, status: 'PENDING' },
      ] as const;
      await tx.employeeComplianceRequirement.createMany({
        data: checklist.map((item) => ({
          tenantId,
          employeeId: created.id,
          code: item.code,
          title: item.title,
          category: item.category as any,
          jurisdiction: item.code === 'FL_NEW_HIRE' ? 'FLORIDA' : 'COMPANY',
          status: item.status as any,
          required: item.required,
          source: 'SYSTEM',
        })),
      });

      return created;
    });

    return this.findOne(employee.id, this.buildSystemActor(tenantId), tenantId);
  }

  private async generateEmployeeNumber(tenantId: string) {
    const count = await this.prisma.employee.findMany({ where: { tenantId }, select: { id: true } }).then((items) => items.length);
    return `EMP-${String(count + 1).padStart(6, '0')}`;
  }

  /** @deprecated Kept for internal compatibility. */
  create(tenantId: string, dto: RegisterEmployeeDto) {
    return this.register(tenantId, dto);
  }

  async validateBulkLoad(tenantId: string, dto: BulkLoadEmployeesDto) {
    const emails = dto.employees.map((employee) => (employee.email ?? '').trim().toLowerCase());
    const branchIds = [...new Set(dto.employees.map((employee) => employee.primaryBranchId).filter((id): id is string => Boolean(id)))];
    const [branches, existing] = await Promise.all([
      this.prisma.branch.findMany({
      where: { id: { in: branchIds }, tenantId },
        select: { id: true },
      }),
      this.prisma.employee.findMany({
        where: { tenantId, email: { in: emails, mode: 'insensitive' } },
        select: { email: true },
      }),
    ]);
    const validBranchIds = new Set(branches.map((branch) => branch.id));
    const existingEmails = new Set(existing.map((employee) => employee.email.trim().toLowerCase()));
    const emailCounts = new Map<string, number>();
    for (const email of emails) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);

    const rows = dto.employees.map((input, index) => {
      const email = (input.email ?? '').trim().toLowerCase();
      const errors = [
        ...((emailCounts.get(email) ?? 0) > 1 ? ['DUPLICATE_EMAIL_IN_LOAD'] : []),
        ...(existingEmails.has(email) ? ['EMPLOYEE_EMAIL_ALREADY_REGISTERED'] : []),
        ...(!input.primaryBranchId || !validBranchIds.has(input.primaryBranchId) ? ['BRANCH_NOT_AVAILABLE_IN_TENANT'] : []),
      ];
      return {
        row: index + 1,
        valid: errors.length === 0,
        errors,
        employee: {
          name: (input.name ?? '').trim(),
          email,
          status: input.status,
          primaryBranchId: input.primaryBranchId,
          primaryRole: (input.primaryRole ?? '').trim(),
        },
      };
    });

    return {
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      invalid: rows.filter((row) => !row.valid).length,
      rows,
    };
  }

  async bulkLoad(tenantId: string, dto: BulkLoadEmployeesDto) {
    const validation = await this.validateBulkLoad(tenantId, dto);
    if (validation.invalid > 0) {
      throw new BadRequestException({
        message: 'La carga contiene registros de empleados que requieren corrección',
        validation,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const employees = [] as Array<{ id: string; email: string }>;
      for (const input of dto.employees) {
        const name = (input.name ?? '').trim();
        const email = (input.email ?? '').trim().toLowerCase();
        const jobTitle = (input.primaryRole ?? '').trim();
        const branchId = input.primaryBranchId!;
        const employee = await tx.employee.create({
          data: {
            tenantId,
            employeeNumber: await this.generateEmployeeNumber(tenantId),
            name,
            email,
            jobTitle,
            status: input.status,
          },
        });
        await tx.employeeBranch.create({
          data: {
            tenantId,
            employeeId: employee.id,
            branchId,
            role: jobTitle,
            isPrimary: true,
          },
        });
        employees.push({ id: employee.id, email: employee.email });
      }
      return employees;
    });

    return {
      created: created.length,
      employees: created,
      message: `${created.length} registros de empleados cargados correctamente`,
    };
  }

  /** @deprecated Kept for internal compatibility. */
  bulkCreate(tenantId: string, dto: BulkLoadEmployeesDto) {
    return this.bulkLoad(tenantId, dto);
  }

  async findAll(tenantId: string, activeBranchId: string, query: ListEmployeesDto) {
    const pagination = normalizeOffsetPagination(query);
    const branchId = query.branchId ?? activeBranchId;
    await this.assertBranchBelongsToTenant(branchId, tenantId);

    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      branchAssignments: {
        some: {
          tenantId,
          branchId,
          releasedAt: null,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: {
          branchAssignments: {
            where: {
              tenantId,
              releasedAt: null,
            },
            include: {
              branch: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
          },
          _count: { select: { documents: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data: items.map((employee) => this.mapEmployee(employee)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findOne(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      include: {
        branchAssignments: {
          where: {
            tenantId,
            releasedAt: null,
          },
          include: {
            branch: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
        },
        _count: { select: { documents: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    return this.mapEmployee(employee);
  }

  async update(id: string, actor: JwtPayload, tenantId: string, dto: UpdateEmployeeDto) {
    await this.ensureEmployeeExists(id, actor, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.jobTitle !== undefined) {
        await tx.employeeBranch.updateMany({
          where: { tenantId, employeeId: id, isPrimary: true, releasedAt: null },
          data: { role: dto.jobTitle.trim() },
        });
      }
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await this.releaseActiveAssignments(id, tenantId);
    }

    return this.findOne(id, actor, tenantId);
  }

  async updateStatus(id: string, actor: JwtPayload, tenantId: string, dto: UpdateEmployeeStatusDto) {
    await this.ensureEmployeeExists(id, actor, tenantId);

    await this.prisma.employee.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await this.releaseActiveAssignments(id, tenantId);
    }

    return this.findOne(id, actor, tenantId);
  }

  async bulkUpdateStatus(actor: JwtPayload, tenantId: string, dto: BulkUpdateEmployeeStatusDto) {
    const employeeIds = [...new Set(dto.employeeIds)];
    if (!employeeIds.length) {
      throw new BadRequestException('Debes seleccionar al menos un empleado');
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        id: { in: employeeIds },
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        jobTitle: true,
      },
    });

    if (employees.length !== employeeIds.length) {
      throw new NotFoundException('Uno o más empleados no están disponibles en el contexto actual');
    }

    await this.prisma.employee.updateMany({
      where: { tenantId, id: { in: employeeIds } },
      data: { status: dto.status },
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await Promise.all(employeeIds.map((id) => this.releaseActiveAssignments(id, tenantId)));
    }

    return {
      updated: await Promise.all(employeeIds.map((id) => this.findOne(id, actor, tenantId))),
      previous: employees,
      status: dto.status,
    };
  }

  async history(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      include: {
        branchAssignments: {
          where: {
            tenantId,
          },
          include: {
            branch: true,
          },
          orderBy: [{ assignedAt: 'desc' }],
        },
        documents: {
          where: { tenantId, status: { not: 'SUPERSEDED' } },
          select: {
            id: true,
            category: true,
            originalName: true,
            status: true,
            version: true,
            createdAt: true,
            updatedAt: true,
            reviewedAt: true,
            expiresAt: true,
            deletedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const auditTrail = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: 'Employee', entityId: employee.id },
      select: {
        id: true,
        action: true,
        userId: true,
        email: true,
        actorRole: true,
        before: true,
        after: true,
        correlationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      employeeId: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      status: employee.status,
      jobTitle: employee.jobTitle,
      source: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
      assignments: employee.branchAssignments.map((assignment) => ({
        id: assignment.id,
        employeeId: employee.id,
        branchId: assignment.branchId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
        active: assignment.releasedAt === null,
        assignedAt: assignment.assignedAt,
        unassignedAt: assignment.releasedAt,
        branch: assignment.branch,
      })),
      documents: (employee as any).employeeDocuments ?? (employee as any).documents ?? [],
      auditTrail,
    };
  }

  async overview(id: string, actor: JwtPayload, tenantId: string) {
    const [employee, documentSummary, history] = await Promise.all([
      this.prisma.employee.findFirst({
        where: {
          id,
          tenantId,
          ...this.buildBranchScopedWhere(actor, tenantId),
        },
        include: {
          branchAssignments: {
            where: {
              tenantId,
              releasedAt: null,
            },
            include: {
              branch: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
          },
          _count: {
            select: {
              documents: {
                where: { deletedAt: null, status: { not: 'SUPERSEDED' } },
              },
            },
          },
        },
      }),
      this.documentSummary(id, actor, tenantId),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: 'Employee', entityId: id },
        select: {
          id: true,
          action: true,
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const primaryAssignment = (employee as any).branchAssignments.find((assignment: any) => assignment.isPrimary) ?? (employee as any).branchAssignments[0] ?? null;
    const documentStats = documentSummary.summary;
    const expiringDocuments = documentSummary.documents.filter((document) => document.expiresAt && document.expiresAt > new Date() && document.expiresAt <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    return {
      employeeId: employee.id,
      basicInformation: {
        name: employee.name,
        email: employee.email,
        status: employee.status,
        recordSource: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
      },
      employment: {
        jobTitle: employee.jobTitle,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      },
      branch: primaryAssignment
        ? {
            branchId: primaryAssignment.branchId,
            name: primaryAssignment.branch.name,
            role: primaryAssignment.role,
            isPrimary: true,
          }
        : null,
      department: null,
      position: employee.jobTitle ? { title: employee.jobTitle } : null,
      supervisor: null,
      complianceSummary: {
        totalDocuments: documentStats.total,
        pendingReview: documentStats.pendingReview,
        approved: documentStats.approved,
        rejected: documentStats.rejected,
        expired: documentStats.expired,
        expiringWithin30Days: documentStats.expiringWithin30Days,
        byCategory: documentStats.byCategory,
      },
      trainingSummary: null,
      assetSummary: null,
      alerts: [
        ...(documentStats.pendingReview > 0 ? [{ type: 'DOCUMENTS_PENDING_REVIEW', severity: 'warning', message: `${documentStats.pendingReview} documentos requieren revisión` }] : []),
        ...(expiringDocuments.length > 0 ? [{ type: 'DOCUMENTS_EXPIRING', severity: 'warning', message: `${expiringDocuments.length} documentos vencen pronto` }] : []),
        ...(history.length > 0 ? [] : [{ type: 'NO_AUDIT_HISTORY', severity: 'info', message: 'Todavía no hay eventos auditables para este empleado' }]),
      ],
      documentSummary: {
        totalDocuments: documentStats.total,
      },
    };
  }

  async editor(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      include: {
        branchAssignments: {
          where: { tenantId, releasedAt: null },
          include: { branch: true },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
        },
        employmentProfile: true,
        payrollProfile: true,
        taxProfile: true,
        workEligibilityProfile: true,
        floridaNewHireReport: true,
        complianceRequirements: {
          orderBy: [{ required: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const primaryAssignment = employee.branchAssignments.find((assignment) => assignment.isPrimary)
      ?? employee.branchAssignments[0]
      ?? null;

    return {
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        status: employee.status,
        personal: {
          legalFirstName: employee.legalFirstName,
          middleName: employee.middleName,
          legalLastName: employee.legalLastName,
          preferredName: employee.preferredName,
          dateOfBirth: employee.dateOfBirth,
        },
        contact: {
          workEmail: employee.workEmail ?? employee.email,
          personalEmail: employee.personalEmail,
          phone: employee.phone,
          addressLine1: employee.addressLine1,
          addressLine2: employee.addressLine2,
          city: employee.city,
          state: employee.state,
          postalCode: employee.postalCode,
          country: employee.country,
        },
        emergencyContact: {
          name: employee.emergencyContactName,
          relationship: employee.emergencyContactRelationship,
          phone: employee.emergencyContactPhone,
        },
      },
      employment: {
        primaryBranchId: employee.employmentProfile?.branchId ?? primaryAssignment?.branchId ?? null,
        jobTitle: employee.employmentProfile?.jobTitle ?? employee.jobTitle ?? primaryAssignment?.role ?? null,
        department: employee.employmentProfile?.department ?? null,
        supervisorUserId: employee.employmentProfile?.supervisorUserId ?? employee.supervisorUserId ?? null,
        employmentType: employee.employmentProfile?.employmentType ?? null,
        employmentStatus: employee.employmentProfile?.employmentStatus ?? null,
        hireDate: employee.employmentProfile?.hireDate ?? null,
        startDate: employee.employmentProfile?.startDate ?? null,
        workerClassification: employee.employmentProfile?.workerClassification ?? null,
      },
      payroll: employee.payrollProfile ? {
        payType: employee.payrollProfile.payType,
        payRateMasked: employee.payrollProfile.payRateLast4 ? `***${employee.payrollProfile.payRateLast4}` : null,
        payFrequency: employee.payrollProfile.payFrequency,
        overtimeEligible: employee.payrollProfile.overtimeEligible,
        regularHourlyRateMasked: employee.payrollProfile.regularHourlyRateLast4 ? `***${employee.payrollProfile.regularHourlyRateLast4}` : null,
        workweekStartDay: employee.payrollProfile.workweekStartDay,
        workweekStartTime: employee.payrollProfile.workweekStartTime,
        paymentMethod: employee.payrollProfile.paymentMethod,
        payrollProvider: employee.payrollProfile.payrollProvider,
        payrollEmployeeId: employee.payrollProfile.payrollEmployeeId,
        externalPayrollReference: employee.payrollProfile.externalPayrollReference,
      } : null,
      tax: employee.taxProfile ? {
        ssnMasked: this.maskSensitiveSsn(employee.taxProfile.ssnEncrypted, employee.taxProfile.ssnLast4),
        w4Status: employee.taxProfile.w4Status,
        w2Reference: employee.taxProfile.w2Reference,
      } : null,
      eligibility: employee.workEligibilityProfile ? {
        i9Status: employee.workEligibilityProfile.i9Status,
        firstDayOfEmployment: employee.workEligibilityProfile.firstDayOfEmployment,
        reverificationRequired: employee.workEligibilityProfile.reverificationRequired,
        eVerifyRequired: employee.workEligibilityProfile.eVerifyRequired,
        eVerifyStatus: employee.workEligibilityProfile.eVerifyStatus,
      } : null,
      floridaNewHire: employee.floridaNewHireReport ? {
        required: employee.floridaNewHireReport.required,
        status: employee.floridaNewHireReport.status,
        dueDate: employee.floridaNewHireReport.dueDate,
      } : null,
      requirements: employee.complianceRequirements.map((requirement) => ({
        id: requirement.id,
        code: requirement.code,
        title: requirement.title,
        category: requirement.category,
        status: requirement.status,
        required: requirement.required,
        dueDate: requirement.dueDate,
        expiresAt: requirement.expiresAt,
      })),
    };
  }

  async payrollCompliance(id: string, actor: JwtPayload, tenantId: string) {
    const [employee, tenant, documentSummary, history, auditTrail] = await Promise.all([
      this.prisma.employee.findFirst({
        where: {
          id,
          tenantId,
          ...this.buildBranchScopedWhere(actor, tenantId),
        },
        include: {
          branchAssignments: {
            where: {
              tenantId,
              releasedAt: null,
            },
            include: { branch: true },
            orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
          },
        },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true },
      }),
      this.documentSummary(id, actor, tenantId),
      this.history(id, actor, tenantId),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: 'Employee', entityId: id },
        select: {
          id: true,
          action: true,
          email: true,
          actorRole: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    if (!employee || !tenant) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const [payrollProfile, taxProfile, eligibilityProfile, floridaProfile] = await Promise.all([
      (this.prisma as any).employeePayrollProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeTaxProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeWorkEligibilityProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeFloridaNewHireReport?.findUnique?.({ where: { employeeId: id } }) ?? null,
    ]);

    const primaryAssignment = (employee as any).branchAssignments.find((assignment: any) => assignment.isPrimary) ?? (employee as any).branchAssignments[0] ?? null;
    const now = new Date();
    const expiringBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringDocuments = documentSummary.documents.filter((document) => document.expiresAt && document.expiresAt > now && document.expiresAt <= expiringBefore);
    const w4Document = documentSummary.documents.find((document) => document.category === 'W4') ?? null;
    const i9Document = documentSummary.documents.find((document) => document.category === 'I9') ?? null;
    const identityDocument = documentSummary.documents.find((document) => document.category === 'IDENTITY' || document.category === 'IDENTIFICATION') ?? null;

    return {
      employeeId: employee.id,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        status: employee.status,
        jobTitle: employee.jobTitle,
        recordSource: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
        branch: primaryAssignment
          ? {
              branchId: primaryAssignment.branchId,
              name: primaryAssignment.branch.name,
              role: primaryAssignment.role,
            }
          : null,
      },
      payroll: {
        payType: payrollProfile?.payType ?? null,
        payRate: payrollProfile?.payRateLast4 ? `***${payrollProfile.payRateLast4}` : null,
        payFrequency: payrollProfile?.payFrequency ?? null,
        overtimeEligible: payrollProfile?.overtimeEligible ?? null,
        regularHourlyRate: payrollProfile?.regularHourlyRateLast4 ? `***${payrollProfile.regularHourlyRateLast4}` : null,
        workweekStartDay: payrollProfile?.workweekStartDay ?? null,
        workweekStartTime: payrollProfile?.workweekStartTime ?? null,
        payrollProvider: payrollProfile?.payrollProvider ?? null,
        payrollEmployeeId: payrollProfile?.payrollEmployeeId ?? null,
        externalPayrollReference: payrollProfile?.externalPayrollReference ?? null,
      },
      tax: {
        w4Status: taxProfile?.w4Status ?? (w4Document ? 'COMPLETE' : 'NOT_STARTED'),
        w4CompletedAt: taxProfile?.w4CompletedAt ?? w4Document?.createdAt ?? null,
        w4EffectiveAt: w4Document?.updatedAt ?? null,
        w4DocumentId: taxProfile?.w4DocumentId ?? w4Document?.id ?? null,
        w4Version: w4Document?.version ?? null,
        ssnMasked: this.maskSensitiveSsn(taxProfile?.ssnEncrypted, taxProfile?.ssnLast4),
      },
      i9: {
        status: eligibilityProfile?.i9Status ?? (i9Document ? 'VERIFIED' : 'NOT_STARTED'),
        firstDayOfEmployment: eligibilityProfile?.firstDayOfEmployment ?? null,
        section1CompletedAt: eligibilityProfile?.section1CompletedAt ?? null,
        section2CompletedAt: eligibilityProfile?.section2CompletedAt ?? null,
        verificationDueDate: eligibilityProfile?.verificationDueDate ?? null,
        verificationCompletedAt: eligibilityProfile?.verificationCompletedAt ?? null,
        reverificationRequired: eligibilityProfile?.reverificationRequired ?? false,
        reverificationDueDate: eligibilityProfile?.reverificationDueDate ?? null,
        documentId: eligibilityProfile?.i9DocumentId ?? i9Document?.id ?? null,
        retentionUntil: i9Document?.expiresAt ?? null,
      },
      eVerify: {
        required: eligibilityProfile?.eVerifyRequired ?? false,
        requirementReason: null,
        status: eligibilityProfile?.eVerifyStatus ?? 'NOT_REQUIRED',
        caseNumber: eligibilityProfile?.eVerifyCaseNumber ?? null,
        submittedAt: eligibilityProfile?.eVerifySubmittedAt ?? null,
        completedAt: eligibilityProfile?.eVerifyCompletedAt ?? null,
        documentId: null,
      },
      floridaNewHire: {
        required: floridaProfile?.required ?? false,
        status: floridaProfile?.status ?? 'PENDING',
        dueDate: floridaProfile?.dueDate ?? null,
        submittedAt: floridaProfile?.submittedAt ?? null,
        confirmationNumber: floridaProfile?.confirmationNumber ?? null,
        failureReason: floridaProfile?.failureReason ?? null,
      },
      complianceSummary: {
        totalDocuments: documentSummary.summary.total,
        pendingReview: documentSummary.summary.pendingReview,
        approved: documentSummary.summary.approved,
        rejected: documentSummary.summary.rejected,
        expired: documentSummary.summary.expired,
        expiringWithin30Days: documentSummary.summary.expiringWithin30Days,
        byCategory: documentSummary.summary.byCategory,
        expiringDocuments: expiringDocuments.map((document) => ({
          id: document.id,
          category: document.category,
          originalName: document.originalName,
          expiresAt: document.expiresAt,
        })),
      },
      documents: {
        total: documentSummary.summary.total,
        w4DocumentId: w4Document?.id ?? null,
        i9DocumentId: i9Document?.id ?? null,
        identityDocumentId: identityDocument?.id ?? null,
      },
      history: {
        employeeId: history.employeeId,
        assignments: history.assignments.length,
        documents: history.documents?.length ?? 0,
        auditTrail: history.auditTrail.length,
      },
      auditTrail: auditTrail.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorEmail: entry.email,
        actorRole: entry.actorRole,
        createdAt: entry.createdAt,
      })),
      alerts: [
        ...(documentSummary.summary.pendingReview > 0 ? [{ type: 'DOCUMENTS_PENDING_REVIEW', severity: 'warning', message: `${documentSummary.summary.pendingReview} documentos requieren revisión` }] : []),
        ...(expiringDocuments.length > 0 ? [{ type: 'DOCUMENTS_EXPIRING', severity: 'warning', message: `${expiringDocuments.length} documentos vencerán en los próximos 30 días` }] : []),
        ...(identityDocument ? [] : [{ type: 'IDENTITY_DOC_MISSING', severity: 'info', message: 'No hay documento de identidad relacionado' }]),
      ],
    };
  }

  async documentSummary(id: string, actor: JwtPayload, tenantId: string) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    const now = new Date();
    const expiringBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const documents = await this.prisma.employeeDocument.findMany({
      where: { tenantId, employeeId: id, deletedAt: null, status: { not: 'SUPERSEDED' } },
      select: {
        id: true,
        category: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        scanStatus: true,
        status: true,
        version: true,
        rejectionReason: true,
        expiresAt: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ category: 'asc' }, { version: 'desc' }],
    });
    const byCategory = documents.reduce<Record<string, number>>((summary, document) => {
      summary[document.category] = (summary[document.category] ?? 0) + 1;
      return summary;
    }, {});

    return {
      employeeId: id,
      generatedAt: now,
      summary: {
        total: documents.length,
        pendingReview: documents.filter((document) => document.status === 'PENDING_REVIEW').length,
        approved: documents.filter((document) => document.status === 'APPROVED').length,
        rejected: documents.filter((document) => document.status === 'REJECTED').length,
        expired: documents.filter((document) => document.expiresAt && document.expiresAt <= now).length,
        expiringWithin30Days: documents.filter(
          (document) => document.expiresAt && document.expiresAt > now && document.expiresAt <= expiringBefore,
        ).length,
        byCategory,
      },
      documents,
    };
  }

  async uploadDocument(
    id: string,
    actor: JwtPayload,
    tenantId: string,
    file: Express.Multer.File,
    dto: { section: string; documentType: string; notes?: string; expiresAt?: string | null },
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo');
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException('El archivo debe ser PDF, JPG o PNG');
    }

    const employee = await this.ensureEmployeeExists(id, actor, tenantId);
    const branch = await this.prisma.employeeBranch.findFirst({
      where: { tenantId, employeeId: id, isPrimary: true, releasedAt: null },
      select: { branchId: true },
    });
    if (!branch) {
      throw new NotFoundException('No se encontró la sucursal principal del empleado');
    }

    const stored = await this.documentStorage.store(tenantId, id, file);
    const section = this.normalizeDocumentSection(dto.section);
    const documentType = (dto.documentType ?? dto.section ?? 'OTHER').trim().toUpperCase();

    try {
      const document = await this.prisma.employeeDocument.create({
        data: {
          tenantId,
          branchId: branch.branchId,
          employeeId: id,
          category: documentType,
          originalName: file.originalname,
          storageKey: stored.key,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksum: stored.checksum,
          scanStatus: 'CLEAN',
          status: 'PENDING_REVIEW',
          sensitivity: section === 'tax' ? 'HIGHLY_SENSITIVE' : section === 'eligibility' ? 'SENSITIVE' : 'STANDARD',
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          metadata: {
            source: 'employee-editor',
            section,
            notes: dto.notes?.trim() ?? null,
          },
          uploadedById: actor.sub,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'EMPLOYEE_DOCUMENT_UPLOADED',
          domain: 'TENANT_OPERATIONS',
          entityType: 'Employee',
          entityId: employee.id,
          tenantId,
          targetTenantId: tenantId,
          actorTenantId: actor.tenantId ?? tenantId,
          actorScope: actor.scope === 'global' ? 'GLOBAL' : actor.scope === 'tenant' ? 'TENANT' : 'BRANCH',
          actorRole: actor.role ?? null,
          userId: actor.sub,
          email: actor.email ?? null,
          branchId: branch.branchId,
          method: 'POST',
          route: `/api/employees/${id}/documents`,
          statusCode: 201,
          after: {
            documentId: document.id,
            section,
            documentType,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        },
      });

      return {
        id: document.id,
        employeeId: id,
        branchId: branch.branchId,
        section,
        category: document.category,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        status: document.status,
        scanStatus: document.scanStatus,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      };
    } catch (error) {
      await this.documentStorage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async employee360(id: string, actor: JwtPayload, tenantId: string) {
    const [overview, compliance, documents, audit] = await Promise.all([
      this.overview(id, actor, tenantId),
      this.compliance(id, actor, tenantId),
      this.documentSummary(id, actor, tenantId),
      this.audit(id, actor, tenantId),
    ]);

    return {
      employeeId: id,
      overview,
      compliance,
      documents,
      audit,
    };
  }

  async compliance(id: string, actor: JwtPayload, tenantId: string) {
    const [employee, payrollProfile, taxProfile, eligibilityProfile, floridaProfile, requirements] = await Promise.all([
      this.prisma.employee.findFirst({
        where: {
          id,
          tenantId,
          ...this.buildBranchScopedWhere(actor, tenantId),
        },
        include: {
          branchAssignments: {
            where: { tenantId, releasedAt: null },
            include: { branch: true },
            orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
          },
        },
      }),
      (this.prisma as any).employeePayrollProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeTaxProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeWorkEligibilityProfile?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeFloridaNewHireReport?.findUnique?.({ where: { employeeId: id } }) ?? null,
      (this.prisma as any).employeeComplianceRequirement?.findMany?.({
        where: { tenantId, employeeId: id },
        orderBy: [{ required: 'desc' }, { createdAt: 'asc' }],
      }) ?? [],
    ]);

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const primaryAssignment = employee.branchAssignments.find((assignment) => assignment.isPrimary) ?? employee.branchAssignments[0] ?? null;

    return {
      employeeId: id,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        status: employee.status,
        jobTitle: employee.jobTitle,
      },
      branch: primaryAssignment
        ? {
            branchId: primaryAssignment.branchId,
            name: primaryAssignment.branch.name,
            role: primaryAssignment.role,
          }
        : null,
      payroll: payrollProfile
        ? {
            payType: payrollProfile.payType,
            payFrequency: payrollProfile.payFrequency,
            overtimeEligible: payrollProfile.overtimeEligible,
            paymentMethod: payrollProfile.paymentMethod,
            payrollProvider: payrollProfile.payrollProvider,
            payrollEmployeeId: payrollProfile.payrollEmployeeId,
            externalPayrollReference: payrollProfile.externalPayrollReference,
            effectiveFrom: payrollProfile.effectiveFrom,
          }
        : null,
      tax: taxProfile
        ? {
            w4Status: taxProfile.w4Status,
            w4CompletedAt: taxProfile.w4CompletedAt,
            w4DocumentId: taxProfile.w4DocumentId ?? null,
            w2Reference: taxProfile.w2Reference ?? null,
            ssnMasked: this.maskSensitiveSsn(taxProfile.ssnEncrypted, taxProfile.ssnLast4),
          }
        : null,
      workEligibility: eligibilityProfile
        ? {
            i9Status: eligibilityProfile.i9Status,
            firstDayOfEmployment: eligibilityProfile.firstDayOfEmployment,
            section1CompletedAt: eligibilityProfile.section1CompletedAt,
            section2CompletedAt: eligibilityProfile.section2CompletedAt,
            verificationDueDate: eligibilityProfile.verificationDueDate,
            verificationCompletedAt: eligibilityProfile.verificationCompletedAt,
            reverificationRequired: eligibilityProfile.reverificationRequired,
            reverificationDueDate: eligibilityProfile.reverificationDueDate,
            eVerifyRequired: eligibilityProfile.eVerifyRequired,
            eVerifyStatus: eligibilityProfile.eVerifyStatus,
            eVerifyCaseNumber: eligibilityProfile.eVerifyCaseNumber ?? null,
          }
        : null,
      floridaNewHire: floridaProfile
        ? {
            required: floridaProfile.required,
            status: floridaProfile.status,
            dueDate: floridaProfile.dueDate,
            submittedAt: floridaProfile.submittedAt,
            confirmationNumber: floridaProfile.confirmationNumber ?? null,
            failureReason: floridaProfile.failureReason ?? null,
          }
        : null,
      requirements: requirements.map((requirement: any) => ({
        id: requirement.id,
        code: requirement.code,
        title: requirement.title,
        category: requirement.category,
        jurisdiction: requirement.jurisdiction,
        status: requirement.status,
        required: requirement.required,
        dueDate: requirement.dueDate,
        completedAt: requirement.completedAt,
        expiresAt: requirement.expiresAt,
        source: requirement.source,
      })),
    };
  }

  async audit(id: string, actor: JwtPayload, tenantId: string) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    const items = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: 'Employee', entityId: id },
      select: {
        id: true,
        action: true,
        userId: true,
        email: true,
        actorRole: true,
        actorScope: true,
        before: true,
        after: true,
        correlationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      employeeId: id,
      total: items.length,
      items: items.map((entry) => ({
        id: entry.id,
        action: entry.action,
        userId: entry.userId,
        email: entry.email,
        actorRole: entry.actorRole,
        actorScope: entry.actorScope,
        correlationId: entry.correlationId,
        createdAt: entry.createdAt,
        before: this.redactAuditPayload(entry.before as Record<string, unknown> | null),
        after: this.redactAuditPayload(entry.after as Record<string, unknown> | null),
      })),
    };
  }

  async transfer(id: string, actor: JwtPayload, tenantId: string, dto: TransferEmployeeDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertBranchInActorScope(actor, dto.branchId);

    const employee = await this.ensureEmployeeExists(id, actor, tenantId);
    const currentPrimary = await this.prisma.employeeBranch.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        isPrimary: true,
        releasedAt: null,
      },
    });

    if (!currentPrimary) {
      throw new BadRequestException('El empleado no tiene una sucursal principal activa');
    }

    if (currentPrimary.branchId === dto.branchId) {
      throw new BadRequestException('La sucursal destino debe ser diferente de la sucursal principal actual');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeBranch.update({
        where: { id: currentPrimary.id },
        data: {
          releasedAt: new Date(),
        },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: employee.id,
          branchId: dto.branchId,
          role: dto.role,
          isPrimary: true,
        },
      });
    });

    return this.findOne(id, actor, tenantId);
  }

  async assignSecondaryBranch(id: string, actor: JwtPayload, tenantId: string, dto: AssignEmployeeBranchDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertBranchInActorScope(actor, dto.branchId);
    await this.ensureEmployeeExists(id, actor, tenantId);

    const [activeAssignment, currentPrimary] = await Promise.all([
      this.prisma.employeeBranch.findFirst({
        where: {
          tenantId,
          employeeId: id,
          branchId: dto.branchId,
          releasedAt: null,
        },
      }),
      this.prisma.employeeBranch.findFirst({
        where: {
          tenantId,
          employeeId: id,
          isPrimary: true,
          releasedAt: null,
        },
      }),
    ]);

    if (activeAssignment) {
      throw new BadRequestException('El empleado ya tiene una asignación activa en esa sucursal');
    }

    await this.prisma.employeeBranch.create({
      data: {
        tenantId,
        employeeId: id,
        branchId: dto.branchId,
        role: dto.role,
        // Employees imported from legacy data can lack assignments. Their first
        // assignment must become the primary branch instead of a secondary one.
        isPrimary: !currentPrimary,
      },
    });

    return this.findOne(id, actor, tenantId);
  }

  async updatePersonal(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name?.trim() ?? null } : {}),
        ...(dto.legalFirstName !== undefined ? { legalFirstName: dto.legalFirstName?.trim() ?? null } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName?.trim() ?? null } : {}),
        ...(dto.legalLastName !== undefined ? { legalLastName: dto.legalLastName?.trim() ?? null } : {}),
        ...(dto.preferredName !== undefined ? { preferredName: dto.preferredName?.trim() ?? null } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null } : {}),
      },
    });
    return this.findOne(id, actor, tenantId);
  }

  async updateContact(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.workEmail !== undefined ? { workEmail: dto.workEmail?.trim().toLowerCase() ?? null } : {}),
        ...(dto.personalEmail !== undefined ? { personalEmail: dto.personalEmail?.trim().toLowerCase() ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null } : {}),
        ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1?.trim() ?? null } : {}),
        ...(dto.addressLine2 !== undefined ? { addressLine2: dto.addressLine2?.trim() ?? null } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() ?? null } : {}),
        ...(dto.state !== undefined ? { state: dto.state?.trim() ?? null } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode?.trim() ?? null } : {}),
        ...(dto.country !== undefined ? { country: dto.country?.trim() ?? null } : {}),
      },
    });
    return this.findOne(id, actor, tenantId);
  }

  async updateEmployment(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    if (dto.primaryBranchId) {
      await this.assertBranchBelongsToTenant(dto.primaryBranchId, tenantId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle?.trim() ?? null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.primaryBranchId) {
        const currentPrimary = await tx.employeeBranch.findFirst({
          where: { tenantId, employeeId: id, isPrimary: true, releasedAt: null },
          select: { id: true },
        });
        if (currentPrimary) {
          await tx.employeeBranch.update({
            where: { id: currentPrimary.id },
            data: { releasedAt: new Date() },
          });
        }
        await tx.employeeBranch.create({
          data: {
            tenantId,
            employeeId: id,
            branchId: dto.primaryBranchId,
            role: dto.jobTitle?.trim() ?? 'Empleado',
            isPrimary: true,
          },
        });
      }

      await tx.employeeEmploymentProfile.upsert({
        where: { employeeId: id },
        create: {
          tenantId,
          employeeId: id,
          branchId: dto.primaryBranchId ?? (await tx.employeeBranch.findFirst({ where: { tenantId, employeeId: id, isPrimary: true, releasedAt: null }, select: { branchId: true } }))?.branchId ?? dto.primaryBranchId,
          department: dto.department?.trim() ?? null,
          positionId: dto.positionId?.trim() ?? null,
          supervisorUserId: dto.supervisorUserId ?? null,
          employmentType: dto.employmentType ?? 'FULL_TIME',
          employmentStatus: dto.employmentStatus ?? 'DRAFT',
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          jobTitle: dto.jobTitle?.trim() ?? 'Empleado',
          workerClassification: dto.workerClassification?.trim() ?? null,
        },
        update: {
          ...(dto.primaryBranchId ? { branchId: dto.primaryBranchId } : {}),
          ...(dto.department !== undefined ? { department: dto.department?.trim() ?? null } : {}),
          ...(dto.positionId !== undefined ? { positionId: dto.positionId?.trim() ?? null } : {}),
          ...(dto.supervisorUserId !== undefined ? { supervisorUserId: dto.supervisorUserId ?? null } : {}),
          ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
          ...(dto.employmentStatus !== undefined ? { employmentStatus: dto.employmentStatus } : {}),
          ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate ? new Date(dto.hireDate) : null } : {}),
          ...(dto.startDate !== undefined ? { startDate: dto.startDate ? new Date(dto.startDate) : null } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle?.trim() ?? null } : {}),
          ...(dto.workerClassification !== undefined ? { workerClassification: dto.workerClassification?.trim() ?? null } : {}),
        },
      });
    });

    return this.findOne(id, actor, tenantId);
  }

  async updatePayroll(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employeePayrollProfile.upsert({
      where: { employeeId: id },
      create: {
        tenantId,
        employeeId: id,
        payType: dto.payType ?? 'SALARY',
        payRateEncrypted: dto.payRate ? this.sensitiveCrypto.encrypt(String(dto.payRate)) : null,
        payRateLast4: dto.payRate ? String(dto.payRate).slice(-4) : null,
        payFrequency: dto.payFrequency ?? 'MONTHLY',
        overtimeEligible: dto.overtimeEligible ?? null,
        regularHourlyRateEncrypted: dto.regularHourlyRate ? this.sensitiveCrypto.encrypt(String(dto.regularHourlyRate)) : null,
        regularHourlyRateLast4: dto.regularHourlyRate ? String(dto.regularHourlyRate).slice(-4) : null,
        workweekStartDay: dto.workweekStartDay?.trim() ?? null,
        workweekStartTime: dto.workweekStartTime?.trim() ?? null,
        paymentMethod: dto.paymentMethod ?? 'OTHER',
        payrollProvider: dto.payrollProvider?.trim() ?? null,
        payrollEmployeeId: dto.payrollEmployeeId?.trim() ?? null,
        externalPayrollReference: dto.externalPayrollReference?.trim() ?? null,
        effectiveFrom: new Date(),
      },
      update: {
        ...(dto.payType !== undefined ? { payType: dto.payType } : {}),
        ...(dto.payRate !== undefined ? { payRateEncrypted: dto.payRate ? this.sensitiveCrypto.encrypt(String(dto.payRate)) : null, payRateLast4: dto.payRate ? String(dto.payRate).slice(-4) : null } : {}),
        ...(dto.payFrequency !== undefined ? { payFrequency: dto.payFrequency } : {}),
        ...(dto.overtimeEligible !== undefined ? { overtimeEligible: dto.overtimeEligible } : {}),
        ...(dto.regularHourlyRate !== undefined ? { regularHourlyRateEncrypted: dto.regularHourlyRate ? this.sensitiveCrypto.encrypt(String(dto.regularHourlyRate)) : null, regularHourlyRateLast4: dto.regularHourlyRate ? String(dto.regularHourlyRate).slice(-4) : null } : {}),
        ...(dto.workweekStartDay !== undefined ? { workweekStartDay: dto.workweekStartDay?.trim() ?? null } : {}),
        ...(dto.workweekStartTime !== undefined ? { workweekStartTime: dto.workweekStartTime?.trim() ?? null } : {}),
        ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
        ...(dto.payrollProvider !== undefined ? { payrollProvider: dto.payrollProvider?.trim() ?? null } : {}),
        ...(dto.payrollEmployeeId !== undefined ? { payrollEmployeeId: dto.payrollEmployeeId?.trim() ?? null } : {}),
        ...(dto.externalPayrollReference !== undefined ? { externalPayrollReference: dto.externalPayrollReference?.trim() ?? null } : {}),
      },
    });
    return this.compliance(id, actor, tenantId);
  }

  async updateTax(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employeeTaxProfile.upsert({
      where: { employeeId: id },
      create: {
        tenantId,
        employeeId: id,
        ssnEncrypted: dto.ssn ? this.sensitiveCrypto.encrypt(String(dto.ssn).replace(/\D/g, '')) : null,
        ssnLast4: dto.ssnLast4 ?? (dto.ssn ? String(dto.ssn).replace(/\D/g, '').slice(-4) : null),
        w4Status: dto.w4Status ?? 'NOT_STARTED',
        w2Reference: dto.w2Reference?.trim() ?? null,
        w4CompletedAt: dto.w4Status === 'COMPLETE' ? new Date() : null,
      },
      update: {
        ...(dto.ssn !== undefined ? { ssnEncrypted: dto.ssn ? this.sensitiveCrypto.encrypt(String(dto.ssn).replace(/\D/g, '')) : null, ssnLast4: dto.ssn ? String(dto.ssn).replace(/\D/g, '').slice(-4) : dto.ssnLast4 ?? null } : {}),
        ...(dto.ssnLast4 !== undefined ? { ssnLast4: dto.ssnLast4 ?? null } : {}),
        ...(dto.w4Status !== undefined ? { w4Status: dto.w4Status } : {}),
        ...(dto.w2Reference !== undefined ? { w2Reference: dto.w2Reference?.trim() ?? null } : {}),
      },
    });
    return this.compliance(id, actor, tenantId);
  }

  async updateWorkEligibility(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employeeWorkEligibilityProfile.upsert({
      where: { employeeId: id },
      create: {
        tenantId,
        employeeId: id,
        i9Status: dto.i9Status ?? 'NOT_STARTED',
        firstDayOfEmployment: dto.firstDayOfEmployment ? new Date(dto.firstDayOfEmployment) : null,
        reverificationRequired: dto.reverificationRequired ?? false,
        eVerifyRequired: dto.eVerifyRequired ?? false,
        eVerifyStatus: dto.eVerifyStatus ?? 'NOT_REQUIRED',
      },
      update: {
        ...(dto.i9Status !== undefined ? { i9Status: dto.i9Status } : {}),
        ...(dto.firstDayOfEmployment !== undefined ? { firstDayOfEmployment: dto.firstDayOfEmployment ? new Date(dto.firstDayOfEmployment) : null } : {}),
        ...(dto.reverificationRequired !== undefined ? { reverificationRequired: dto.reverificationRequired } : {}),
        ...(dto.eVerifyRequired !== undefined ? { eVerifyRequired: dto.eVerifyRequired } : {}),
        ...(dto.eVerifyStatus !== undefined ? { eVerifyStatus: dto.eVerifyStatus } : {}),
      },
    });
    return this.compliance(id, actor, tenantId);
  }

  async updateFloridaNewHire(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employeeFloridaNewHireReport.upsert({
      where: { employeeId: id },
      create: {
        tenantId,
        employeeId: id,
        required: dto.required ?? false,
        status: dto.status ?? 'NOT_REQUIRED',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      update: {
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
      },
    });
    return this.compliance(id, actor, tenantId);
  }

  async updateEmergencyContact(id: string, actor: JwtPayload, tenantId: string, dto: Record<string, any>) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { emergencyContactName: dto.name?.trim() ?? null } : {}),
        ...(dto.phone !== undefined ? { emergencyContactPhone: dto.phone?.trim() ?? null } : {}),
        ...(dto.relationship !== undefined ? { emergencyContactRelationship: dto.relationship?.trim() ?? null } : {}),
      },
    });
    return this.findOne(id, actor, tenantId);
  }

  private async ensureEmployeeExists(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    return employee;
  }

  private async assertBranchBelongsToTenant(branchId: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId,
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada en la empresa activa');
    }
  }

  private async releaseActiveAssignments(employeeId: string, tenantId: string) {
    await this.prisma.employeeBranch.updateMany({
      where: {
        tenantId,
        employeeId,
        releasedAt: null,
      },
      data: {
        releasedAt: new Date(),
      },
    });
  }

  private normalizeDocumentSection(section: string) {
    const normalized = (section ?? '').trim().toLowerCase();
    if (['tax', 'w4', 'ssn'].includes(normalized)) return 'tax';
    if (['eligibility', 'i9', 'everify', 'e-verify'].includes(normalized)) return 'eligibility';
    if (['florida', 'florida-new-hire', 'florida_new_hire', 'floridanewhire'].includes(normalized)) return 'floridaNewHire';
    return 'employment';
  }

  private buildBranchScopedWhere(actor: JwtPayload, tenantId: string): Prisma.EmployeeWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return {};
    }

    // A plain branch user is an owner-scoped actor. Branch membership must not
    // allow reading or mutating coworkers that happen to share the same branch.
    if (actor.role === 'BRANCH_USER' || actor.roles.includes('BRANCH_USER')) {
      return {
        email: actor.email,
      };
    }

    if (actor.allowedBranchIds.length === 0) {
      return {
        id: '__no_employee_access__',
      };
    }

    return {
      branchAssignments: {
        some: {
          tenantId,
          branchId: { in: actor.allowedBranchIds },
          releasedAt: null,
        },
      },
    };
  }

  private assertBranchInActorScope(actor: JwtPayload, branchId: string) {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return;
    }

    if (!actor.allowedBranchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }
  }

  private buildSystemActor(tenantId: string): JwtPayload {
    return {
      sub: 'system',
      userId: 'system',
      tenantId,
      allowedTenantIds: [tenantId],
      activeTenantId: tenantId,
      tenantSlug: 'system',
      tenantName: 'system',
      email: 'system@local',
      firstName: 'System',
      lastName: 'Actor',
      role: 'SYSTEM',
      scope: AccessScope.TENANT,
      isSuperAdmin: true,
      roleScope: RoleScope.TENANT_ADMIN,
      allowedBranchIds: [],
      activeBranchId: null,
      roles: ['SYSTEM'],
      permissions: [],
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
  }

  private mapEmployee(
    employee: {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      jobTitle: string | null;
      sourceCandidateId: string | null;
      status: EmployeeStatus;
      createdAt: Date;
      updatedAt: Date;
      branchAssignments: Array<{
        id: string;
        tenantId: string;
        employeeId: string;
        branchId: string;
        role: string;
        isPrimary: boolean;
        assignedAt: Date;
        releasedAt: Date | null;
        branch: {
          id: string;
          tenantId: string;
          name: string;
          location: string;
          createdAt: Date;
          updatedAt: Date;
        };
      }>;
      _count?: { documents: number };
    },
  ) {
    const primaryAssignment =
      employee.branchAssignments.find((assignment) => assignment.isPrimary) ?? null;

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      jobTitle: employee.jobTitle,
      recordSource: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
      status: employee.status,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      documentSummary: {
        totalDocuments: employee._count?.documents ?? 0,
      },
      primaryBranch: primaryAssignment
        ? {
            assignmentId: primaryAssignment.id,
            branchId: primaryAssignment.branchId,
            role: primaryAssignment.role,
            assignedAt: primaryAssignment.assignedAt,
            branch: primaryAssignment.branch,
          }
        : null,
      activeBranches: employee.branchAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        branchId: assignment.branchId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
        assignedAt: assignment.assignedAt,
        branch: assignment.branch,
      })),
    };
  }

  private maskSensitiveSsn(ssnEncrypted: string | null | undefined, ssnLast4: string | null | undefined) {
    if (ssnEncrypted) {
      try {
        return this.sensitiveCrypto.maskSsn(this.sensitiveCrypto.decrypt(ssnEncrypted));
      } catch {
        return ssnLast4 ? `***-**-${ssnLast4}` : null;
      }
    }

    return ssnLast4 ? `***-**-${ssnLast4}` : null;
  }

  private redactAuditPayload(payload: Record<string, unknown> | null) {
    if (!payload) {
      return null;
    }

    const redacted = { ...payload };
    for (const key of ['ssn', 'ssnEncrypted', 'payRate', 'payRateEncrypted', 'regularHourlyRate', 'regularHourlyRateEncrypted']) {
      if (key in redacted) {
        redacted[key] = '[REDACTED]';
      }
    }

    return redacted;
  }
}
