import { BadRequestException } from '@nestjs/common';
import {
  TrainingCourseStatus,
  TrainingPilotStatus,
  TrainingQualityReviewStatus,
} from '@prisma/client';
import { TrainingAdminService } from './training-admin.service';

const actor = {
  sub: 'reviewer-1', tenantId: 'tenant-1', activeTenantId: 'tenant-1', isSuperAdmin: false,
} as any;

describe('training quality gates', () => {
  it('blocks course approval when current-version gates are missing', async () => {
    const completeCourse = {
      id: 'course-1', tenantId: 'tenant-1', status: TrainingCourseStatus.IN_REVIEW, version: 2,
      summary: 'Resumen', description: 'Descripción',
      brief: { businessNeed: 'Necesidad', targetOutcome: 'Resultado', successKpi: 'KPI', audienceDescription: 'Audiencia' },
      courseCompetencies: [{ id: 'competency-1' }], learningObjectives: [{ id: 'objective-1' }], audienceRules: [],
      modules: [{ lessons: [{ estimatedMinutes: 15, blocks: [{ id: 'block-1' }] }] }],
    };
    const prisma = {
      trainingCourse: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(completeCourse)
          .mockResolvedValueOnce(completeCourse)
          .mockResolvedValueOnce({ ...completeCourse, qualityReviews: [], pilots: [] }),
      },
      $transaction: jest.fn(),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.transitionCourse('tenant-1', actor, 'course-1', {
      status: TrainingCourseStatus.APPROVED,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires every checklist item before approving a gate', async () => {
    const service = new TrainingAdminService({} as any, {} as any);

    await expect(service.decideQualityReview('tenant-1', actor, 'review-1', {
      status: TrainingQualityReviewStatus.APPROVED,
      checklist: { accurate: true, accessible: false },
      summary: 'Pendiente',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an in-review course to draft when changes are requested', async () => {
    const course = { id: 'course-1', tenantId: 'tenant-1', version: 3, status: TrainingCourseStatus.IN_REVIEW };
    const review = { id: 'review-1', courseId: 'course-1', courseVersion: 3, reviewerId: null, course };
    const tx = {
      trainingCourseQualityReview: { update: jest.fn().mockResolvedValue({}) },
      trainingCourse: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      trainingCourseQualityReview: { findUnique: jest.fn().mockResolvedValue(review) },
      trainingCourse: {
        findUnique: jest.fn().mockResolvedValue(course),
        findFirst: jest.fn().mockResolvedValue({ ...course, status: TrainingCourseStatus.DRAFT, qualityReviews: [], pilots: [] }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await service.decideQualityReview('tenant-1', actor, 'review-1', {
      status: TrainingQualityReviewStatus.CHANGES_REQUESTED,
      checklist: { accurate: false },
      summary: 'Corregir referencias',
    });

    expect(tx.trainingCourse.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: expect.objectContaining({ status: TrainingCourseStatus.DRAFT }),
    });
  });
});

describe('training course pilot', () => {
  it('rejects completion while a blocking issue exists', async () => {
    const course = { id: 'course-1', tenantId: 'tenant-1', version: 2, status: TrainingCourseStatus.IN_REVIEW };
    const pilot = {
      id: 'pilot-1', tenantId: 'tenant-1', courseId: 'course-1', status: TrainingPilotStatus.ACTIVE,
      participantIds: ['user-1'], successCriteria: { minResponses: 1, minAverageRating: 4 }, course,
      feedback: [{ rating: 5, clarityRating: 5, relevanceRating: 5, blockingIssue: true }],
    };
    const prisma = {
      trainingCoursePilot: { findFirst: jest.fn().mockResolvedValue(pilot), update: jest.fn() },
      trainingCourse: { findUnique: jest.fn().mockResolvedValue(course) },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await expect(service.updateCoursePilotStatus('tenant-1', actor, 'pilot-1', {
      status: TrainingPilotStatus.COMPLETED,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingCoursePilot.update).not.toHaveBeenCalled();
  });

  it('completes a pilot that meets response and rating criteria', async () => {
    const course = { id: 'course-1', tenantId: 'tenant-1', version: 2, status: TrainingCourseStatus.IN_REVIEW };
    const pilot = {
      id: 'pilot-1', tenantId: 'tenant-1', courseId: 'course-1', status: TrainingPilotStatus.ACTIVE,
      participantIds: ['user-1'], successCriteria: { minResponses: 1, minAverageRating: 4 }, course,
      feedback: [{ rating: 5, clarityRating: 4, relevanceRating: 5, blockingIssue: false }],
    };
    const prisma = {
      trainingCoursePilot: {
        findFirst: jest.fn().mockResolvedValue(pilot),
        update: jest.fn().mockResolvedValue({ ...pilot, status: TrainingPilotStatus.COMPLETED }),
      },
      trainingCourse: { findUnique: jest.fn().mockResolvedValue(course) },
    };
    const service = new TrainingAdminService(prisma as any, {} as any);

    await service.updateCoursePilotStatus('tenant-1', actor, 'pilot-1', {
      status: TrainingPilotStatus.COMPLETED,
    });

    expect(prisma.trainingCoursePilot.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: TrainingPilotStatus.COMPLETED }),
    }));
  });
});
