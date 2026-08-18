import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TrainingCourseStatus } from '@prisma/client';
import { allowedTrainingCourseTransitions, TrainingAdminService } from './training-admin.service';

describe('training course editorial workflow', () => {
  it('requires review and approval before publishing', () => {
    expect(allowedTrainingCourseTransitions.DRAFT).toContain(
      TrainingCourseStatus.IN_REVIEW,
    );
    expect(allowedTrainingCourseTransitions.DRAFT).not.toContain(
      TrainingCourseStatus.PUBLISHED,
    );
    expect(allowedTrainingCourseTransitions.IN_REVIEW).toContain(
      TrainingCourseStatus.APPROVED,
    );
    expect(allowedTrainingCourseTransitions.APPROVED).toContain(
      TrainingCourseStatus.PUBLISHED,
    );
  });

  it('supports scheduling, pausing and controlled retirement', () => {
    expect(allowedTrainingCourseTransitions.APPROVED).toContain(
      TrainingCourseStatus.SCHEDULED,
    );
    expect(allowedTrainingCourseTransitions.PUBLISHED).toContain(
      TrainingCourseStatus.PAUSED,
    );
    expect(allowedTrainingCourseTransitions.PAUSED).toContain(
      TrainingCourseStatus.PUBLISHED,
    );
    expect(allowedTrainingCourseTransitions.RETIRED).toHaveLength(0);
  });
});

describe('training course pedagogical foundation', () => {
  const actor = { sub: 'author-1', tenantId: 'tenant-1', activeTenantId: 'tenant-1', isSuperAdmin: false } as any;

  it('reports missing design requirements without affecting existing drafts', async () => {
    const service = new TrainingAdminService({
      trainingCourse: { findFirst: jest.fn().mockResolvedValue({
        id: 'course-1', tenantId: 'tenant-1', brief: null,
        courseCompetencies: [], learningObjectives: [], audienceRules: [],
      }) },
    } as any, {} as any);

    const result = await service.getCourseDesign('tenant-1', actor, 'course-1');

    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.errors).toHaveLength(6);
  });

  it('stores brief, competencies, objectives and audience rules in one transaction', async () => {
    const tx = {
      trainingCourse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'course-1', version: 1, status: TrainingCourseStatus.DRAFT }),
        update: jest.fn().mockResolvedValue({}),
      },
      trainingCourseVersion: { upsert: jest.fn().mockResolvedValue({}) },
      trainingCourseBrief: { upsert: jest.fn().mockResolvedValue({}) },
      trainingLearningObjective: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      trainingCourseCompetency: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      trainingAudienceRule: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      trainingCourse: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT }) },
      trainingCompetency: { findMany: jest.fn().mockResolvedValue([{ id: 'competency-1' }]) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);
    jest.spyOn(service, 'getCourseDesign').mockResolvedValue({ readiness: { ready: true, errors: [] } } as any);

    await service.updateCourseDesign('tenant-1', actor, 'course-1', {
      brief: { businessNeed: 'Reducir errores', targetOutcome: 'Proceso correcto', successKpi: '30% menos incidentes', audienceDescription: 'Operaciones' },
      competencies: [{ competencyId: 'competency-1' }],
      objectives: [{ competencyId: 'competency-1', statement: 'Ejecutar el proceso', successCriteria: 'Sin omisiones', assessmentMethod: 'Caso práctico' }],
      audienceRules: [{ ruleType: 'JOB_TITLE' as any, value: 'Operaciones' }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.trainingCourseBrief.upsert).toHaveBeenCalled();
    expect(tx.trainingCourseCompetency.createMany).toHaveBeenCalled();
    expect(tx.trainingLearningObjective.createMany).toHaveBeenCalled();
    expect(tx.trainingAudienceRule.createMany).toHaveBeenCalled();
  });

  it('blocks review when the pedagogical foundation is incomplete', async () => {
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT })
          .mockResolvedValueOnce({
            id: 'course-1', summary: 'Resumen', description: 'Descripción', brief: null,
            courseCompetencies: [], learningObjectives: [], audienceRules: [],
            modules: [{ lessons: [{ blocks: [{ id: 'block-1' }] }] }],
          }),
      },
      $transaction: jest.fn(),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.transitionCourse('tenant-1', actor, 'course-1', { status: TrainingCourseStatus.IN_REVIEW }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects competencies outside the course tenant scope', async () => {
    const prisma = {
      trainingCourse: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT }) },
      trainingCompetency: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.updateCourseDesign('tenant-1', actor, 'course-1', {
      brief: { businessNeed: '', targetOutcome: '', successKpi: '' },
      competencies: [{ competencyId: 'foreign-competency' }],
      objectives: [],
      audienceRules: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('training course content authoring', () => {
  const actor = { sub: 'author-1', tenantId: 'tenant-1', activeTenantId: 'tenant-1', isSuperAdmin: false } as any;

  it('reorders every module atomically', async () => {
    const prisma = {
      trainingCourse: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT }) },
      trainingCourseModule: {
        findMany: jest.fn().mockResolvedValue([{ id: 'module-1' }, { id: 'module-2' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await service.reorderModules('tenant-1', actor, 'course-1', {
      entityIds: ['module-2', 'module-1'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.trainingCourseModule.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'module-2' },
      data: { sortOrder: 0 },
    });
  });

  it('rejects partial or cross-parent orders', async () => {
    const prisma = {
      trainingCourse: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT }) },
      trainingCourseModule: { findMany: jest.fn().mockResolvedValue([{ id: 'module-1' }, { id: 'module-2' }]), update: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.reorderModules('tenant-1', actor, 'course-1', {
      entityIds: ['module-1', 'foreign-module'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('duplicates a content block with its accessibility metadata', async () => {
    const content = { transcriptUrl: 'https://example.com/transcript' };
    const prisma = {
      trainingCourse: { findUnique: jest.fn().mockResolvedValue({ id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.DRAFT }) },
      trainingContentBlock: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'block-1', lessonId: 'lesson-1', type: 'VIDEO', title: 'Demo', content,
          resourceUrl: 'https://example.com/video', isRequired: true,
          lesson: { module: { courseId: 'course-1', course: { id: 'course-1' } } },
        }),
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue({ id: 'block-copy' }),
      },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await service.duplicateBlock('tenant-1', actor, 'block-1');

    expect(prisma.trainingContentBlock.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      lessonId: 'lesson-1', title: 'Demo (copia)', content, sortOrder: 2,
    }) });
  });
});

describe('training course deletion', () => {
  const actor = { sub: 'author-1', tenantId: 'tenant-1', activeTenantId: 'tenant-1', isSuperAdmin: false } as any;

  it('deletes a draft course and lets database cascades remove its dependencies', async () => {
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          tenantId: 'tenant-1',
          status: TrainingCourseStatus.DRAFT,
        }),
        delete: jest.fn().mockResolvedValue({ id: 'course-1' }),
      },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.deleteCourse('tenant-1', actor, 'course-1')).resolves.toEqual({
      deleted: true,
      id: 'course-1',
    });
    expect(prisma.trainingCourse.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.trainingCourse.delete).toHaveBeenCalledWith({ where: { id: 'course-1' } });
  });

  it('lets an author delete their own legacy global draft', async () => {
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          tenantId: null,
          createdById: actor.sub,
          status: TrainingCourseStatus.DRAFT,
        }),
        delete: jest.fn().mockResolvedValue({ id: 'course-1' }),
      },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.deleteCourse('tenant-1', actor, 'course-1')).resolves.toEqual({
      deleted: true,
      id: 'course-1',
    });
    expect(prisma.trainingCourse.delete).toHaveBeenCalledWith({ where: { id: 'course-1' } });
  });

  it('does not let a tenant administrator delete another author global draft', async () => {
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          tenantId: null,
          createdById: 'author-2',
          status: TrainingCourseStatus.DRAFT,
        }),
        delete: jest.fn(),
      },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.deleteCourse('tenant-1', actor, 'course-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trainingCourse.delete).not.toHaveBeenCalled();
  });

  it('keeps archived courses with assignments or progress protected', async () => {
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
            id: 'course-1',
            tenantId: 'tenant-1',
            status: TrainingCourseStatus.ARCHIVED,
          })
          .mockResolvedValueOnce({
            _count: { assignments: 1, progressRecords: 0 },
          }),
        delete: jest.fn(),
      },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.deleteCourse('tenant-1', actor, 'course-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.trainingCourse.delete).not.toHaveBeenCalled();
  });
});
