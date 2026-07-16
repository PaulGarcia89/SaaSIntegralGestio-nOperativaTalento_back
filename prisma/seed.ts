import {
  AccessScope,
  AutomationConsequenceType,
  AutomationScope,
  AutomationTriggerEvent,
  EmployeeStatus,
  ModuleCode,
  PlanCode,
  PrismaClient,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const moduleCatalog = [
  { code: ModuleCode.ATS, name: 'ATS', description: 'Applicant tracking system' },
  { code: ModuleCode.ONBOARDING, name: 'Onboarding', description: 'Employee onboarding workflows' },
  { code: ModuleCode.TRAINING, name: 'Training', description: 'Training and learning management' },
  { code: ModuleCode.INVENTORY, name: 'Inventory', description: 'Operational inventory management' },
  { code: ModuleCode.AI_PRODUCTIVITY, name: 'AI Productivity', description: 'AI productivity workspace' },
  { code: ModuleCode.DOCUMENTS, name: 'Documents', description: 'Document workflows and storage' },
  { code: ModuleCode.REPORTS, name: 'Reports', description: 'Analytics and reporting' },
];

const planCatalog = [
  { code: PlanCode.BASIC, name: 'Basic', description: 'Core recruitment and onboarding', modules: [ModuleCode.ATS, ModuleCode.ONBOARDING] },
  { code: PlanCode.PRO, name: 'Pro', description: 'Operational suite with AI productivity', modules: [ModuleCode.ATS, ModuleCode.ONBOARDING, ModuleCode.TRAINING, ModuleCode.INVENTORY, ModuleCode.AI_PRODUCTIVITY, ModuleCode.DOCUMENTS] },
  { code: PlanCode.ENTERPRISE, name: 'Enterprise', description: 'Full platform with analytics', modules: Object.values(ModuleCode) },
];

const permissionCatalog = [
  'tenants.read', 'tenants.create', 'tenants.update', 'tenants.delete',
  'branches.read', 'branches.create', 'branches.update', 'branches.delete',
  'vacancies.read', 'vacancies.create', 'vacancies.update', 'vacancies.delete',
  'applications.read', 'applications.create', 'applications.update', 'applications.delete',
  'training.read', 'training.create', 'training.update', 'training.delete',
  'users.read', 'users.create', 'users.update', 'users.delete',
  'employees.read', 'employees.create', 'employees.update', 'employees.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.delete',
  'permissions.read',
  'plans.read', 'plans.create', 'plans.update', 'plans.delete',
  'modules.read', 'modules.create', 'modules.update', 'modules.delete',
  'subscriptions.read', 'subscriptions.create', 'subscriptions.update', 'subscriptions.delete',
  'automation.read', 'automation.create', 'automation.update',
  'automation.audit.read', 'workflow_master.read', 'domain_events.create',
];

const scopedRoleCatalog = [
  {
    code: 'TENANT_ADMIN',
    name: 'Tenant Admin',
    description: 'Full tenant-wide access across all branches',
    permissions: permissionCatalog,
  },
  {
    code: 'BRANCH_ADMIN',
    name: 'Branch Admin',
    description: 'Branch-local operations plus tenant-wide read access',
    permissions: permissionCatalog.filter((permission) =>
      permission.endsWith('.read') ||
      permission.startsWith('employees.') ||
      permission.startsWith('branches.read'),
    ),
  },
  {
    code: 'BRANCH_USER',
    name: 'Branch User',
    description: 'Operational access limited to assigned branches',
    permissions: permissionCatalog.filter((permission) =>
      permission === 'employees.read' ||
      permission === 'employees.update' ||
      permission === 'branches.read',
    ),
  },
];

const automationRuleTemplates = [
  {
    name: 'Alta operativa al contratar',
    triggerEvent: AutomationTriggerEvent.CANDIDATE_HIRED,
    scope: AutomationScope.BRANCH,
    consequences: [
      { type: AutomationConsequenceType.CREATE_ONBOARDING },
      { type: AutomationConsequenceType.ASSIGN_ASSET },
      { type: AutomationConsequenceType.ACTIVATE_TRAINING },
      { type: AutomationConsequenceType.MARK_WORKFLOW_STAGE, stepKey: 'ONBOARDING' },
      { type: AutomationConsequenceType.NOTIFY_ACTOR, title: 'Contratación recibida', message: 'Se disparó el flujo de alta automática.' },
    ],
  },
  {
    name: 'Habilitar operación al completar onboarding',
    triggerEvent: AutomationTriggerEvent.ONBOARDING_COMPLETED,
    scope: AutomationScope.BRANCH,
    consequences: [
      { type: AutomationConsequenceType.MARK_WORKFLOW_STAGE, stepKey: 'TRAINING' },
      { type: AutomationConsequenceType.NOTIFY_ACTOR, title: 'Onboarding completado', message: 'El empleado puede pasar a formación.' },
    ],
  },
  {
    name: 'Cerrar formación y habilitar handoff',
    triggerEvent: AutomationTriggerEvent.TRAINING_COMPLETED,
    scope: AutomationScope.BRANCH,
    consequences: [
      { type: AutomationConsequenceType.MARK_WORKFLOW_STAGE, stepKey: 'OPERATION' },
      { type: AutomationConsequenceType.CREATE_POLICY_CHECK, title: 'Validación operativa', policyCode: 'handoff-operativo' },
    ],
  },
  {
    name: 'Cerrar cumplimiento al finalizar operación',
    triggerEvent: AutomationTriggerEvent.OPERATION_HANDOFF_COMPLETED,
    scope: AutomationScope.BRANCH,
    consequences: [
      { type: AutomationConsequenceType.PROVISION_ACCESS },
      { type: AutomationConsequenceType.MARK_WORKFLOW_STAGE, stepKey: 'ADMIN_COMPLIANCE' },
    ],
  },
  {
    name: 'Cierre final de cumplimiento',
    triggerEvent: AutomationTriggerEvent.COMPLIANCE_CLOSED,
    scope: AutomationScope.BRANCH,
    consequences: [
      { type: AutomationConsequenceType.NOTIFY_ACTOR, title: 'Workflow completado', message: 'El flujo maestro quedó cerrado.' },
    ],
  },
];

async function main() {
  for (const entry of moduleCatalog) {
    await prisma.featureModule.upsert({
      where: { code: entry.code },
      update: { name: entry.name, description: entry.description },
      create: entry,
    });
  }

  const moduleMap = new Map(
    (await prisma.featureModule.findMany()).map((item) => [item.code, item.id]),
  );

  for (const entry of planCatalog) {
    const plan = await prisma.plan.upsert({
      where: { code: entry.code },
      update: { name: entry.name, description: entry.description },
      create: { code: entry.code, name: entry.name, description: entry.description },
    });

    await prisma.planModule.deleteMany({ where: { planId: plan.id } });
    await prisma.planModule.createMany({
      data: entry.modules.map((moduleCode) => ({
        planId: plan.id,
        moduleId: moduleMap.get(moduleCode)!,
      })),
      skipDuplicates: true,
    });
  }

  for (const code of permissionCatalog) {
    await prisma.permission.upsert({
      where: { code },
      update: { name: code, description: `Permission ${code}` },
      create: { code, name: code, description: `Permission ${code}` },
    });
  }

  const tenantSlug = process.env.SUPERADMIN_TENANT_SLUG ?? 'platform';
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: 'Platform', status: TenantStatus.ACTIVE },
    create: { name: 'Platform', slug: tenantSlug, status: TenantStatus.ACTIVE },
  });

  const enterprisePlan = await prisma.plan.findUniqueOrThrow({ where: { code: PlanCode.ENTERPRISE } });
  const platformSubscription = await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      planId: enterprisePlan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: null,
    },
    create: {
      tenantId: tenant.id,
      planId: enterprisePlan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: new Date(),
    },
  });

  const existingSuperRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'SUPERADMIN' },
  });

  const superRole = existingSuperRole
    ? await prisma.role.update({
        where: { id: existingSuperRole.id },
        data: { name: 'Super Admin', isSystem: true },
      })
    : await prisma.role.create({
        data: {
          tenantId: tenant.id,
          code: 'SUPERADMIN',
          name: 'Super Admin',
          scope: AccessScope.GLOBAL,
          isSystem: true,
        },
      });

  const permissions = await prisma.permission.findMany();
  await prisma.rolePermission.deleteMany({ where: { roleId: superRole.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: superRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });

  for (const scopedRoleEntry of scopedRoleCatalog) {
    const existingScopedRole = await prisma.role.findFirst({
      where: {
        tenantId: tenant.id,
        code: scopedRoleEntry.code,
      },
    });

    const scopedRole = existingScopedRole
      ? await prisma.role.update({
          where: { id: existingScopedRole.id },
          data: {
            name: scopedRoleEntry.name,
            description: scopedRoleEntry.description,
            scope: scopedRoleEntry.code === 'TENANT_ADMIN' ? AccessScope.TENANT : AccessScope.BRANCH,
            isSystem: true,
          },
        })
      : await prisma.role.create({
          data: {
            tenantId: tenant.id,
            code: scopedRoleEntry.code,
            name: scopedRoleEntry.name,
            description: scopedRoleEntry.description,
            scope: scopedRoleEntry.code === 'TENANT_ADMIN' ? AccessScope.TENANT : AccessScope.BRANCH,
            isSystem: true,
          },
        });

    const scopedPermissions = permissions.filter((permission) =>
      scopedRoleEntry.permissions.includes(permission.code),
    );

    await prisma.rolePermission.deleteMany({ where: { roleId: scopedRole.id } });
    await prisma.rolePermission.createMany({
      data: scopedPermissions.map((permission) => ({
        roleId: scopedRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  const email = process.env.SUPERADMIN_EMAIL ?? 'superadmin@saasintegral.com';
  const password = process.env.SUPERADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
  });

  const user = existingSuperAdmin
    ? await prisma.user.update({
        where: { id: existingSuperAdmin.id },
        data: {
          firstName: 'Super',
          lastName: 'Admin',
          passwordHash,
          isSuperAdmin: true,
          status: UserStatus.ACTIVE,
        },
      })
    : await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          firstName: 'Super',
          lastName: 'Admin',
          isSuperAdmin: true,
          status: UserStatus.ACTIVE,
        },
      });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superRole.id } },
    update: {},
    create: { userId: user.id, roleId: superRole.id },
  });

  const tenantAdminOperationalPermissions = permissions.filter((permission) =>
    permission.code.startsWith('vacancies.') ||
    permission.code.startsWith('branches.') ||
    permission.code.startsWith('applications.'),
  );

  const tenantAdminRoles = await prisma.role.findMany({
    where: {
      code: {
        in: ['SUPERADMIN', 'ADMIN', 'TENANT_ADMIN'],
      },
    },
    select: {
      id: true,
    },
  });

  for (const role of tenantAdminRoles) {
    await prisma.rolePermission.createMany({
      data: tenantAdminOperationalPermissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  const planMap = new Map(
    (await prisma.plan.findMany()).map((plan) => [plan.code, plan.id]),
  );
  const permissionMap = new Map(permissions.map((permission) => [permission.code, permission.id]));

  const demoTenants = [
    {
      name: 'TalentOS Cloud USA',
      slug: 'talentos-cloud-usa',
      status: TenantStatus.ACTIVE,
      planCode: PlanCode.ENTERPRISE,
      branches: [
        { name: 'Sede principal de Miami', location: 'Miami, FL' },
      ],
      featureFlags: [ModuleCode.REPORTS, ModuleCode.AI_PRODUCTIVITY, ModuleCode.INVENTORY, ModuleCode.TRAINING],
      users: [
        {
          email: 'ava.thompson@talentoscloud.com',
          firstName: 'Ava',
          lastName: 'Thompson',
          roleCode: 'TENANT_ADMIN',
          status: UserStatus.ACTIVE,
        },
      ],
    },
    {
      name: 'Sunrise Health Florida',
      slug: 'sunrise-health-florida',
      status: TenantStatus.ACTIVE,
      planCode: PlanCode.PRO,
      branches: [
        { name: 'Centro asistencial de Orlando', location: 'Orlando, FL' },
        { name: 'Hub clinico de Tampa', location: 'Tampa, FL' },
      ],
      featureFlags: [ModuleCode.REPORTS],
      users: [
        {
          email: 'olivia.carter@sunrisehealthfl.com',
          firstName: 'Olivia',
          lastName: 'Carter',
          roleCode: 'HR_MANAGER',
          status: UserStatus.ACTIVE,
        },
      ],
    },
    {
      name: 'Gulfshore Logistics',
      slug: 'gulfshore-logistics',
      status: TenantStatus.ACTIVE,
      planCode: PlanCode.BASIC,
      branches: [
        { name: 'Patio de distribucion de Jacksonville', location: 'Jacksonville, FL' },
      ],
      featureFlags: [ModuleCode.INVENTORY],
      users: [
        {
          email: 'emma.collins@gulfshorelogistics.com',
          firstName: 'Emma',
          lastName: 'Collins',
          roleCode: 'SUPERVISOR',
          status: UserStatus.ACTIVE,
        },
      ],
    },
  ] as const;

  const demoRoleTemplates = [
    {
      code: 'TENANT_ADMIN',
      name: 'Tenant Admin',
      permissions: permissionCatalog,
    },
    {
      code: 'HR_MANAGER',
      name: 'HR Manager',
      permissions: permissionCatalog.filter((permission) =>
        permission.startsWith('vacancies.') ||
        permission.startsWith('applications.') ||
        permission.startsWith('training.') ||
        permission.startsWith('users.read') ||
        permission.startsWith('branches.read') ||
        permission === 'roles.read' ||
        permission === 'permissions.read' ||
        permission === 'tenants.read',
      ),
    },
    {
      code: 'SUPERVISOR',
      name: 'Supervisor',
      permissions: permissionCatalog.filter((permission) =>
        permission.endsWith('.read') ||
        permission === 'branches.update' ||
        permission === 'employees.update',
      ),
    },
  ] as const;

  for (const demoTenant of demoTenants) {
    const tenantRecord = await prisma.tenant.upsert({
      where: { slug: demoTenant.slug },
      update: {
        name: demoTenant.name,
        status: demoTenant.status,
      },
      create: {
        name: demoTenant.name,
        slug: demoTenant.slug,
        status: demoTenant.status,
      },
    });

    await prisma.subscription.upsert({
      where: { tenantId: tenantRecord.id },
      update: {
        planId: planMap.get(demoTenant.planCode)!,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: null,
        trialEndsAt: null,
      },
      create: {
        tenantId: tenantRecord.id,
        planId: planMap.get(demoTenant.planCode)!,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
      },
    });

    for (const moduleCode of demoTenant.featureFlags) {
      await prisma.tenantFeatureFlag.upsert({
        where: {
          tenantId_moduleCode: {
            tenantId: tenantRecord.id,
            moduleCode,
          },
        },
        update: { enabled: true },
        create: {
          tenantId: tenantRecord.id,
          moduleCode,
          enabled: true,
        },
      });
    }

    const branchIdsByName = new Map<string, string>();
    for (const branchEntry of demoTenant.branches) {
      const branch = await prisma.branch.upsert({
        where: {
          tenantId_name: {
            tenantId: tenantRecord.id,
            name: branchEntry.name,
          },
        },
        update: { location: branchEntry.location },
        create: {
          tenantId: tenantRecord.id,
          name: branchEntry.name,
          location: branchEntry.location,
        },
      });
      branchIdsByName.set(branchEntry.name, branch.id);
    }

    for (const roleTemplate of demoRoleTemplates) {
      const role = await prisma.role.upsert({
        where: {
          tenantId_code: {
            tenantId: tenantRecord.id,
            code: roleTemplate.code,
          },
        },
        update: {
          name: roleTemplate.name,
          scope: roleTemplate.code === 'TENANT_ADMIN' ? AccessScope.TENANT : AccessScope.BRANCH,
          isSystem: true,
        },
        create: {
          tenantId: tenantRecord.id,
          code: roleTemplate.code,
          name: roleTemplate.name,
          scope: roleTemplate.code === 'TENANT_ADMIN' ? AccessScope.TENANT : AccessScope.BRANCH,
          isSystem: true,
        },
      });

      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: roleTemplate.permissions.map((permissionCode) => ({
          roleId: role.id,
          permissionId: permissionMap.get(permissionCode)!,
        })),
        skipDuplicates: true,
      });
    }

    for (const userEntry of demoTenant.users) {
      const demoUser = await prisma.user.upsert({
        where: {
          tenantId_email: {
            tenantId: tenantRecord.id,
            email: userEntry.email,
          },
        },
        update: {
          firstName: userEntry.firstName,
          lastName: userEntry.lastName,
          passwordHash,
          status: userEntry.status,
          activeBranchId: branchIdsByName.get(demoTenant.branches[0].name) ?? null,
        },
        create: {
          tenantId: tenantRecord.id,
          email: userEntry.email,
          passwordHash,
          firstName: userEntry.firstName,
          lastName: userEntry.lastName,
          status: userEntry.status,
          activeBranchId: branchIdsByName.get(demoTenant.branches[0].name) ?? null,
        },
      });

      const role = await prisma.role.findUniqueOrThrow({
        where: {
          tenantId_code: {
            tenantId: tenantRecord.id,
            code: userEntry.roleCode,
          },
        },
      });

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: demoUser.id, roleId: role.id } },
        update: {},
        create: { userId: demoUser.id, roleId: role.id },
      });

      await prisma.userBranchAccess.deleteMany({ where: { userId: demoUser.id } });
      await prisma.userBranchAccess.createMany({
        data: [...branchIdsByName.values()].map((branchId) => ({
          userId: demoUser.id,
          branchId,
        })),
        skipDuplicates: true,
      });
    }

    const firstBranchId = branchIdsByName.get(demoTenant.branches[0].name)!;
    const firstUser = await prisma.user.findFirst({
      where: {
        tenantId: tenantRecord.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const ruleTemplate of automationRuleTemplates) {
      const existingRule = await prisma.automationRule.findFirst({
        where: {
          tenantId: tenantRecord.id,
          branchId: firstBranchId,
          triggerEvent: ruleTemplate.triggerEvent,
          name: ruleTemplate.name,
        },
      });

      if (existingRule) {
        await prisma.automationRule.update({
          where: { id: existingRule.id },
          data: {
            scope: ruleTemplate.scope,
            enabled: true,
            version: existingRule.version + 1,
            consequences: ruleTemplate.consequences as never,
            conditions: [] as never,
          },
        });
      } else {
        await prisma.automationRule.create({
          data: {
            tenantId: tenantRecord.id,
            branchId: firstBranchId,
            name: ruleTemplate.name,
            triggerEvent: ruleTemplate.triggerEvent,
            scope: ruleTemplate.scope,
            conditions: [] as never,
            enabled: true,
            version: 1,
            consequences: ruleTemplate.consequences as never,
            createdBy: firstUser?.id,
          },
        });
      }
    }

    const sampleEmployee = await prisma.employee.upsert({
      where: {
        tenantId_email: {
          tenantId: tenantRecord.id,
          email: `employee.${demoTenant.slug}@example.com`,
        },
      },
      update: {
        name: `Employee ${demoTenant.name}`,
        status: EmployeeStatus.ACTIVE,
      },
      create: {
        tenantId: tenantRecord.id,
        name: `Employee ${demoTenant.name}`,
        email: `employee.${demoTenant.slug}@example.com`,
        status: EmployeeStatus.ACTIVE,
      },
    });

    const employeePrimaryAssignment = await prisma.employeeBranch.findFirst({
      where: {
        tenantId: tenantRecord.id,
        employeeId: sampleEmployee.id,
        branchId: firstBranchId,
        isPrimary: true,
        releasedAt: null,
      },
    });

    if (!employeePrimaryAssignment) {
      await prisma.employeeBranch.create({
        data: {
          tenantId: tenantRecord.id,
          employeeId: sampleEmployee.id,
          branchId: firstBranchId,
          role: 'Operations Associate',
          isPrimary: true,
        },
      });
    }

    const sampleCandidate = await prisma.candidate.upsert({
      where: {
        tenantId_email: {
          tenantId: tenantRecord.id,
          email: `candidate.${demoTenant.slug}@example.com`,
        },
      },
      update: {
        fullName: `Candidate ${demoTenant.name}`,
        city: demoTenant.branches[0].location,
      },
      create: {
        tenantId: tenantRecord.id,
        fullName: `Candidate ${demoTenant.name}`,
        email: `candidate.${demoTenant.slug}@example.com`,
        city: demoTenant.branches[0].location,
      },
    });

    const sampleVacancy =
      (await prisma.vacancy.findFirst({
        where: {
          tenantId: tenantRecord.id,
          branchId: firstBranchId,
          title: `Operations Coordinator - ${demoTenant.name}`,
        },
      })) ??
      (await prisma.vacancy.create({
        data: {
          tenantId: tenantRecord.id,
          branchId: firstBranchId,
          createdByUserId: firstUser?.id,
          title: `Operations Coordinator - ${demoTenant.name}`,
          summary: 'Workflow-ready operational vacancy',
          description: 'Sample vacancy for workflow orchestration testing.',
          department: 'Operations',
          city: demoTenant.branches[0].location,
          status: 'OPEN',
        },
      }));

    await prisma.vacancyApplication.upsert({
      where: {
        vacancyId_candidateId: {
          vacancyId: sampleVacancy.id,
          candidateId: sampleCandidate.id,
        },
      },
      update: {
        status: 'INTERVIEW',
      },
      create: {
        tenantId: tenantRecord.id,
        vacancyId: sampleVacancy.id,
        candidateId: sampleCandidate.id,
        status: 'INTERVIEW',
      },
    });

    await prisma.inventoryItem.upsert({
      where: {
        tenantId_sku: {
          tenantId: tenantRecord.id,
          sku: `LAP-${demoTenant.slug.toUpperCase()}`,
        },
      },
      update: {
        name: `Laptop bundle ${demoTenant.name}`,
        qtyGlobal: 10,
      },
      create: {
        tenantId: tenantRecord.id,
        sku: `LAP-${demoTenant.slug.toUpperCase()}`,
        name: `Laptop bundle ${demoTenant.name}`,
        qtyGlobal: 10,
      },
    });
  }

  const trainingCategoryData = [
    {
      slug: 'induccion-general',
      name: 'Induccion General',
      description: 'Ruta base para nuevas incorporaciones',
      sortOrder: 1,
    },
    {
      slug: 'operacion-pdv',
      name: 'Operacion de PDV',
      description: 'Procesos operativos para sucursales y punto de venta',
      sortOrder: 2,
    },
    {
      slug: 'liderazgo',
      name: 'Liderazgo',
      description: 'Desarrollo de lideres y encargados',
      sortOrder: 3,
    },
  ];

  const categoryMap = new Map<string, string>();
  for (const categoryEntry of trainingCategoryData) {
    const category = await prisma.trainingCategory.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: categoryEntry.slug,
        },
      },
      update: {
        name: categoryEntry.name,
        description: categoryEntry.description,
        sortOrder: categoryEntry.sortOrder,
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        ...categoryEntry,
        isActive: true,
      },
    });
    categoryMap.set(categoryEntry.slug, category.id);
  }

  const curriculumData = [
    {
      slug: 'onboarding-restaurantes',
      title: 'Escuela de Induccion Restaurantes',
      description: 'Ruta de entrada para equipos operativos y administrativos del restaurante.',
      coverImageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      objective: 'Acelerar el tiempo a productividad y estandarizar la experiencia de ingreso.',
      targetAudience: 'Nuevos ingresos del tenant',
      estimatedMinutes: 360,
      difficulty: 'BEGINNER' as const,
      categoryId: categoryMap.get('induccion-general')!,
    },
    {
      slug: 'lideres-sucursal',
      title: 'Academia de Lideres de Sucursal',
      description: 'Ruta para supervisores, encargados y branch admins.',
      coverImageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f',
      objective: 'Desarrollar liderazgo operativo, control de indicadores y seguimiento de equipos.',
      targetAudience: 'Supervisores y lideres',
      estimatedMinutes: 420,
      difficulty: 'INTERMEDIATE' as const,
      categoryId: categoryMap.get('liderazgo')!,
    },
  ];

  const curriculumMap = new Map<string, string>();
  for (const curriculumEntry of curriculumData) {
    const curriculum = await prisma.trainingCurriculum.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug: curriculumEntry.slug,
        },
      },
      update: {
        title: curriculumEntry.title,
        description: curriculumEntry.description,
        coverImageUrl: curriculumEntry.coverImageUrl,
        objective: curriculumEntry.objective,
        targetAudience: curriculumEntry.targetAudience,
        estimatedMinutes: curriculumEntry.estimatedMinutes,
        difficulty: curriculumEntry.difficulty,
        categoryId: curriculumEntry.categoryId,
        isPublished: true,
      },
      create: {
        tenantId: tenant.id,
        ...curriculumEntry,
        isPublished: true,
      },
    });
    curriculumMap.set(curriculumEntry.slug, curriculum.id);
  }

  const courseData = [
    ['bienvenida-plataforma', 'Bienvenida a la plataforma', 'VIDEO', 'VIDEO', 'onboarding-restaurantes', 'induccion-general', 25],
    ['politicas-y-cultura', 'Politicas, cultura y experiencia', 'COURSE', 'ARTICLE', 'onboarding-restaurantes', 'induccion-general', 40],
    ['seguridad-alimentaria', 'Seguridad alimentaria y BPM', 'COURSE', 'PDF', 'onboarding-restaurantes', 'operacion-pdv', 50],
    ['servicio-al-cliente', 'Servicio al cliente en sala', 'COURSE', 'VIDEO', 'onboarding-restaurantes', 'operacion-pdv', 45],
    ['caja-y-cierre', 'Caja, arqueo y cierre operativo', 'DOCUMENT', 'PDF', 'onboarding-restaurantes', 'operacion-pdv', 35],
    ['gestion-turnos', 'Gestion de turnos y productividad', 'COURSE', 'ARTICLE', 'lideres-sucursal', 'liderazgo', 60],
    ['liderazgo-situacional', 'Liderazgo situacional', 'COURSE', 'VIDEO', 'lideres-sucursal', 'liderazgo', 55],
    ['tablero-kpis', 'Tablero de KPIs operativos', 'COURSE', 'LINK', 'lideres-sucursal', 'liderazgo', 40],
  ] as const;

  const courseMap = new Map<string, string>();
  for (const [slug, title, type, resourceType, curriculumSlug, categorySlug, estimatedMinutes] of courseData) {
    const course = await prisma.trainingCourse.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug,
        },
      },
      update: {
        title,
        summary: `${title} - contenido demo para frontend.`,
        description: `Contenido completo de ${title} para el tenant platform.`,
        coverImageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
        type,
        resourceType,
        resourceUrl: 'https://example.com/training/resource',
        estimatedMinutes,
        difficulty: curriculumSlug === 'lideres-sucursal' ? 'INTERMEDIATE' : 'BEGINNER',
        points: estimatedMinutes,
        isRequired: true,
        isPublished: true,
        categoryId: categoryMap.get(categorySlug)!,
        curriculumId: curriculumMap.get(curriculumSlug)!,
        tags: ['demo', 'frontend', curriculumSlug],
      },
      create: {
        tenantId: tenant.id,
        slug,
        title,
        summary: `${title} - contenido demo para frontend.`,
        description: `Contenido completo de ${title} para el tenant platform.`,
        coverImageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
        type,
        resourceType,
        resourceUrl: 'https://example.com/training/resource',
        estimatedMinutes,
        difficulty: curriculumSlug === 'lideres-sucursal' ? 'INTERMEDIATE' : 'BEGINNER',
        points: estimatedMinutes,
        isRequired: true,
        isPublished: true,
        categoryId: categoryMap.get(categorySlug)!,
        curriculumId: curriculumMap.get(curriculumSlug)!,
        tags: ['demo', 'frontend', curriculumSlug],
      },
    });
    courseMap.set(slug, course.id);
  }

  for (const [slug] of courseData) {
    const courseId = courseMap.get(slug)!;
    await prisma.trainingCourseStep.deleteMany({ where: { courseId } });
    await prisma.trainingCourseStep.createMany({
      data: [
        {
          courseId,
          title: 'Introduccion',
          description: 'Paso inicial del curso',
          stepType: 'VIDEO',
          contentUrl: 'https://example.com/video',
          sortOrder: 1,
          estimatedMinutes: 8,
          isRequired: true,
        },
        {
          courseId,
          title: 'Lectura guiada',
          description: 'Lectura base del material',
          stepType: 'READING',
          contentUrl: 'https://example.com/reading',
          sortOrder: 2,
          estimatedMinutes: 10,
          isRequired: true,
        },
        {
          courseId,
          title: 'Evaluacion rapida',
          description: 'Validacion de conocimiento',
          stepType: 'QUIZ',
          contentUrl: null,
          sortOrder: 3,
          estimatedMinutes: 5,
          isRequired: true,
        },
      ],
    });
  }

  for (const [slug, title] of courseData) {
    const courseId = courseMap.get(slug)!;
    const existingQuiz = await prisma.trainingQuiz.findFirst({
      where: { courseId },
      select: { id: true },
    });
    const quiz = existingQuiz
      ? await prisma.trainingQuiz.update({
          where: { id: existingQuiz.id },
          data: {
            title: `Quiz ${title}`,
            description: `Evaluacion del curso ${title}`,
            passingScore: 70,
            maxAttempts: 3,
            timeLimitMinutes: 20,
          },
        })
      : await prisma.trainingQuiz.create({
          data: {
            courseId,
            title: `Quiz ${title}`,
            description: `Evaluacion del curso ${title}`,
            passingScore: 70,
            maxAttempts: 3,
            timeLimitMinutes: 20,
          },
        });

    await prisma.trainingQuizQuestion.deleteMany({ where: { quizId: quiz.id } });
    const question = await prisma.trainingQuizQuestion.create({
      data: {
        quizId: quiz.id,
        prompt: `Pregunta base del curso ${title}`,
        questionType: 'SINGLE_CHOICE',
        sortOrder: 1,
        explanation: 'Respuesta correcta para demo.',
      },
    });

    await prisma.trainingQuizOption.createMany({
      data: [
        { questionId: question.id, label: 'Opcion correcta', isCorrect: true, sortOrder: 1 },
        { questionId: question.id, label: 'Opcion incorrecta', isCorrect: false, sortOrder: 2 },
      ],
    });
  }

  const libraryData = [
    ['manual-bienvenida', 'Manual de bienvenida', 'PDF', 'induccion-general'],
    ['checklist-onboarding', 'Checklist de onboarding', 'DOCUMENT', 'induccion-general'],
    ['guia-bpm', 'Guia BPM', 'PDF', 'operacion-pdv'],
    ['playbook-liderazgo', 'Playbook de liderazgo', 'LINK', 'liderazgo'],
  ] as const;

  for (const [slug, title, resourceType, categorySlug] of libraryData) {
    await prisma.trainingLibraryResource.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug,
        },
      },
      update: {
        title,
        description: `${title} recurso de apoyo del modulo training.`,
        resourceType,
        fileUrl: resourceType === 'LINK' ? null : 'https://example.com/resource.pdf',
        externalUrl: resourceType === 'LINK' ? 'https://example.com/guide' : null,
        thumbnailUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
        mimeType: resourceType === 'PDF' ? 'application/pdf' : null,
        sizeBytes: 245760,
        durationSeconds: null,
        language: 'es',
        tags: ['demo', 'training'],
        isFeatured: true,
        isPublished: true,
        categoryId: categoryMap.get(categorySlug)!,
      },
      create: {
        tenantId: tenant.id,
        slug,
        title,
        description: `${title} recurso de apoyo del modulo training.`,
        resourceType,
        fileUrl: resourceType === 'LINK' ? null : 'https://example.com/resource.pdf',
        externalUrl: resourceType === 'LINK' ? 'https://example.com/guide' : null,
        thumbnailUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
        mimeType: resourceType === 'PDF' ? 'application/pdf' : null,
        sizeBytes: 245760,
        durationSeconds: null,
        language: 'es',
        tags: ['demo', 'training'],
        isFeatured: true,
        isPublished: true,
        categoryId: categoryMap.get(categorySlug)!,
      },
    });
  }

  const eventOneExisting = await prisma.trainingEvent.findFirst({
    where: { tenantId: tenant.id, title: 'Kickoff escuela de induccion' },
    select: { id: true },
  });
  const eventOne = eventOneExisting
    ? await prisma.trainingEvent.update({
        where: { id: eventOneExisting.id },
        data: {
          title: 'Kickoff escuela de induccion',
          description: 'Sesion virtual de bienvenida para nuevos ingresos.',
          startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          location: 'Zoom',
          modality: 'VIRTUAL',
          relatedCurriculumId: curriculumMap.get('onboarding-restaurantes')!,
          capacity: 100,
        },
      })
    : await prisma.trainingEvent.create({
        data: {
          tenantId: tenant.id,
          title: 'Kickoff escuela de induccion',
          description: 'Sesion virtual de bienvenida para nuevos ingresos.',
          startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          location: 'Zoom',
          modality: 'VIRTUAL',
          relatedCurriculumId: curriculumMap.get('onboarding-restaurantes')!,
          capacity: 100,
        },
      });

  const eventTwoExisting = await prisma.trainingEvent.findFirst({
    where: { tenantId: tenant.id, title: 'Workshop de KPIs operativos' },
    select: { id: true },
  });
  const eventTwo = eventTwoExisting
    ? await prisma.trainingEvent.update({
        where: { id: eventTwoExisting.id },
        data: {
          title: 'Workshop de KPIs operativos',
          description: 'Sesion practica para lideres de sucursal.',
          startsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
          location: 'HQ Bogota',
          modality: 'HYBRID',
          relatedCourseId: courseMap.get('tablero-kpis')!,
          capacity: 40,
        },
      })
    : await prisma.trainingEvent.create({
        data: {
          tenantId: tenant.id,
          title: 'Workshop de KPIs operativos',
          description: 'Sesion practica para lideres de sucursal.',
          startsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
          location: 'HQ Bogota',
          modality: 'HYBRID',
          relatedCourseId: courseMap.get('tablero-kpis')!,
          capacity: 40,
        },
      });

  await prisma.tenantTrainingModuleAccess.upsert({
    where: { tenantId: tenant.id },
    update: {
      subscriptionId: platformSubscription.id,
      planId: enterprisePlan.id,
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
    create: {
      tenantId: tenant.id,
      subscriptionId: platformSubscription.id,
      planId: enterprisePlan.id,
      enabled: true,
      enabledAt: new Date(),
    },
  });

  const onboardingCurriculumId = curriculumMap.get('onboarding-restaurantes')!;
  const introCourseId = courseMap.get('bienvenida-plataforma')!;
  const serviceCourseId = courseMap.get('servicio-al-cliente')!;

  await prisma.trainingAssignment.upsert({
    where: {
      tenantId_userId_curriculumId: {
        tenantId: tenant.id,
        userId: user.id,
        curriculumId: onboardingCurriculumId,
      },
    },
    update: {
      assignmentType: 'CURRICULUM',
      sourceType: 'ONBOARDING',
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      progressPercent: 50,
      status: 'IN_PROGRESS',
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      curriculumId: onboardingCurriculumId,
      assignmentType: 'CURRICULUM',
      sourceType: 'ONBOARDING',
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      progressPercent: 50,
      status: 'IN_PROGRESS',
    },
  });

  await prisma.trainingAssignment.upsert({
    where: {
      tenantId_userId_courseId: {
        tenantId: tenant.id,
        userId: user.id,
        courseId: introCourseId,
      },
    },
    update: {
      assignmentType: 'COURSE',
      sourceType: 'ONBOARDING',
      dueAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      progressPercent: 100,
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      courseId: introCourseId,
      assignmentType: 'COURSE',
      sourceType: 'ONBOARDING',
      dueAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      progressPercent: 100,
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.trainingAssignment.upsert({
    where: {
      tenantId_userId_courseId: {
        tenantId: tenant.id,
        userId: user.id,
        courseId: serviceCourseId,
      },
    },
    update: {
      assignmentType: 'COURSE',
      sourceType: 'MANUAL',
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      progressPercent: 30,
      status: 'IN_PROGRESS',
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      courseId: serviceCourseId,
      assignmentType: 'COURSE',
      sourceType: 'MANUAL',
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      progressPercent: 30,
      status: 'IN_PROGRESS',
    },
  });

  await prisma.trainingProgress.upsert({
    where: {
      tenantId_userId_curriculumId: {
        tenantId: tenant.id,
        userId: user.id,
        curriculumId: onboardingCurriculumId,
      },
    },
    update: {
      progressPercent: 50,
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
      status: 'IN_PROGRESS',
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      curriculumId: onboardingCurriculumId,
      progressPercent: 50,
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
      status: 'IN_PROGRESS',
    },
  });

  await prisma.trainingProgress.upsert({
    where: {
      tenantId_userId_courseId: {
        tenantId: tenant.id,
        userId: user.id,
        courseId: introCourseId,
      },
    },
    update: {
      progressPercent: 100,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      courseId: introCourseId,
      progressPercent: 100,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
    },
  });

  await prisma.trainingProgress.upsert({
    where: {
      tenantId_userId_courseId: {
        tenantId: tenant.id,
        userId: user.id,
        courseId: serviceCourseId,
      },
    },
    update: {
      progressPercent: 30,
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
      status: 'IN_PROGRESS',
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      courseId: serviceCourseId,
      progressPercent: 30,
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
      status: 'IN_PROGRESS',
    },
  });

  const firstCourseSteps = await prisma.trainingCourseStep.findMany({
    where: { courseId: introCourseId },
    orderBy: { sortOrder: 'asc' },
  });

  for (const step of firstCourseSteps) {
    await prisma.trainingStepProgress.upsert({
      where: {
        userId_courseStepId: {
          userId: user.id,
          courseStepId: step.id,
        },
      },
      update: {
        tenantId: tenant.id,
        isCompleted: true,
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        score: step.stepType === 'QUIZ' ? 100 : null,
        timeSpentSeconds: 600,
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        courseStepId: step.id,
        isCompleted: true,
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        score: step.stepType === 'QUIZ' ? 100 : null,
        timeSpentSeconds: 600,
      },
    });
  }

  await prisma.trainingEventAttendance.upsert({
    where: {
      eventId_userId: {
        eventId: eventOne.id,
        userId: user.id,
      },
    },
    update: {
      status: 'REGISTERED',
      registeredAt: new Date(),
    },
    create: {
      eventId: eventOne.id,
      userId: user.id,
      status: 'REGISTERED',
      registeredAt: new Date(),
    },
  });

  await prisma.trainingEventAttendance.upsert({
    where: {
      eventId_userId: {
        eventId: eventTwo.id,
        userId: user.id,
      },
    },
    update: {
      status: 'INVITED',
    },
    create: {
      eventId: eventTwo.id,
      userId: user.id,
      status: 'INVITED',
    },
  });

  const favoriteCourseId = courseMap.get('liderazgo-situacional')!;
  await prisma.trainingFavorite.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: user.id,
        entityType: 'COURSE',
        courseId: favoriteCourseId,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.trainingCertificate.upsert({
    where: {
      tenantId_userId_courseId: {
        tenantId: tenant.id,
        userId: user.id,
        courseId: introCourseId,
      },
    },
    update: {
      certificateUrl: `https://cdn.saasintegral.local/certificates/${user.id}/${introCourseId}.pdf`,
      issuedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      courseId: introCourseId,
      certificateUrl: `https://cdn.saasintegral.local/certificates/${user.id}/${introCourseId}.pdf`,
      issuedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.trainingAnalyticsSnapshot.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      totalMinutes: 85,
      totalCourses: 2,
      completedCourses: 1,
      completionRate: 50,
      overdueCourses: 0,
      certificatesEarned: 1,
      generatedAt: new Date(),
    },
  }).catch(() => null);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
