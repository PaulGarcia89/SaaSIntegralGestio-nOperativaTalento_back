import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompetencyAiAssessmentService } from './competency-ai-assessment.service';

const actor = { sub: 'user-1', scope: 'tenant', allowedBranchIds: [] };
const application = {
  id: 'application-1', vacancyId: 'vacancy-1', currentStageId: null, coverLetter: null, dynamicResponses: null,
  vacancy: { id: 'vacancy-1', branchId: 'branch-1', title: 'Analista', description: null, requirements: null },
  candidate: { resumeFiles: [] }, interviews: [], externalAssessments: [],
};

describe('CompetencyAiAssessmentService', () => {
  it('signs every reviewed competency without changing application status or stage', async () => {
    const assessment = { id: 'assessment-1', version: 1, status: 'READY_FOR_REVIEW', items: [{ id: 'item-1' }] };
    const tx = {
      aiCompetencyAssessmentItem: { update: jest.fn().mockResolvedValue({}) },
      aiCompetencyAssessment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'assessment-1', status: 'SIGNED' }) },
      vacancyApplication: { update: jest.fn() },
    };
    const prisma = {
      vacancyApplication: { findFirst: jest.fn().mockResolvedValue(application), update: jest.fn() },
      aiCompetencyAssessment: { findFirst: jest.fn().mockResolvedValue(assessment) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new CompetencyAiAssessmentService(prisma as never, {} as never);
    await service.sign('tenant-1', actor as never, 'application-1', 'assessment-1', {
      acknowledgement: true,
      items: [{ itemId: 'item-1', humanScore: 4, reviewerNotes: 'Validado en entrevista', confirmed: true }],
      reviewerNotes: 'Revisión humana completa',
    });

    expect(tx.aiCompetencyAssessment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SIGNED', signedByUserId: 'user-1' }) }));
    expect(prisma.vacancyApplication.update).not.toHaveBeenCalled();
    expect(tx.vacancyApplication.update).not.toHaveBeenCalled();
  });

  it('keeps signed versions immutable', async () => {
    const prisma = {
      vacancyApplication: { findFirst: jest.fn().mockResolvedValue(application) },
      aiCompetencyAssessment: { findFirst: jest.fn().mockResolvedValue({ id: 'assessment-1', status: 'SIGNED', items: [] }) },
    };
    const service = new CompetencyAiAssessmentService(prisma as never, {} as never);
    await expect(service.sign('tenant-1', actor as never, 'application-1', 'assessment-1', { acknowledgement: true, items: [] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides applications outside the actor branch scope', async () => {
    const prisma = { vacancyApplication: { findFirst: jest.fn().mockResolvedValue(application) } };
    const service = new CompetencyAiAssessmentService(prisma as never, {} as never);
    await expect(service.latest('tenant-1', { ...actor, scope: 'branch', allowedBranchIds: ['branch-2'] } as never, 'application-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
