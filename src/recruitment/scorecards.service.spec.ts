import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  InterviewRecommendation,
  ScorecardCriterionType,
  ScorecardStatus,
} from '@prisma/client';
import { ScorecardsService } from './scorecards.service';

const actor = {
  sub: 'user-1',
  roles: ['RECRUITER'],
  role: 'RECRUITER',
  scope: 'tenant',
  allowedBranchIds: [],
} as never;

const interview = {
  id: 'interview-1',
  interviewerUserId: 'user-1',
  stageId: 'stage-1',
  scorecardTemplateId: null,
  application: {
    vacancyId: 'vacancy-1',
    vacancy: { branchId: 'branch-1' },
  },
};

const template = {
  id: 'template-1',
  vacancyId: 'vacancy-1',
  stageId: 'stage-1',
  name: 'Panel',
  version: 1,
  criteria: [
    {
      id: 'criterion-1',
      key: 'TECH',
      label: 'Dominio técnico',
      type: ScorecardCriterionType.RATING,
      weight: 100,
      isRequired: true,
      requiresEvidence: true,
      competencyCode: 'TECH',
      competencyName: 'Técnica',
    },
  ],
};

describe('ScorecardsService', () => {
  it('rejects templates whose weighted criteria do not total 100', async () => {
    const prisma = {
      vacancy: { findFirst: jest.fn().mockResolvedValue({ id: 'vacancy-1', branchId: 'branch-1' }) },
    };
    const service = new ScorecardsService(prisma as never);

    await expect(service.createTemplate('tenant-1', actor, {
      vacancyId: 'vacancy-1',
      name: 'Invalid template',
      criteria: [{
        key: 'TECH',
        label: 'Technical',
        type: ScorecardCriterionType.RATING,
        weight: 80,
      }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires evidence and mandatory answers before signing', async () => {
    const prisma = {
      applicationInterview: { findFirst: jest.fn().mockResolvedValue(interview) },
      interviewScorecard: { findUnique: jest.fn().mockResolvedValue(null) },
      scorecardEvaluatorAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      scorecardTemplate: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(template),
      },
    };
    const service = new ScorecardsService(prisma as never);

    await expect(service.submit('tenant-1', actor, 'interview-1', {
      recommendation: InterviewRecommendation.YES,
      responses: [{ criterionId: 'criterion-1', rating: 5 }],
      sign: true,
    })).rejects.toThrow('Evidence is required');
  });

  it('prevents edits after a scorecard has been signed', async () => {
    const prisma = {
      applicationInterview: { findFirst: jest.fn().mockResolvedValue(interview) },
      interviewScorecard: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'scorecard-1',
          status: ScorecardStatus.SIGNED,
        }),
      },
    };
    const service = new ScorecardsService(prisma as never);

    await expect(service.submit('tenant-1', actor, 'interview-1', {
      recommendation: InterviewRecommendation.YES,
      responses: [{ criterionId: 'criterion-1', rating: 4, evidence: 'Example' }],
      sign: true,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not update a competency outside the active tenant', async () => {
    const update = jest.fn();
    const service = new ScorecardsService({ scorecardCompetency: { findFirst: jest.fn().mockResolvedValue(null), update } } as never);
    await expect(service.upsertCompetency('tenant-1', 'competency-other-tenant', { code: 'TECH', name: 'Technical' })).rejects.toThrow('Competency not found');
    expect(update).not.toHaveBeenCalled();
  });

  it('records an exploratory aggregate bias validation without claiming causality', async () => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const service = new ScorecardsService({ biasValidationRun: { create } } as never);
    const result = await service.runBiasValidation('tenant-1', actor, {
      populationField: 'aggregate_group',
      referenceGroup: { name: 'Reference', total: 100, selected: 50 },
      comparisonGroup: { name: 'Comparison', total: 100, selected: 35 },
    });
    expect(create).toHaveBeenCalled();
    expect(result.limitations).toContain('No demuestra causalidad');
    expect(Number(result.selectionRateRatio)).toBeCloseTo(0.7);
  });

  it('flags evaluator disagreement and potentially sensitive language', () => {
    const service = new ScorecardsService({} as never);
    const signals = (service as never as {
      detectBiasSignals: (scorecards: unknown[], criteria: unknown[]) => Array<{ code: string }>;
    }).detectBiasSignals([
      {
        id: 'scorecard-1',
        reviewerUserId: 'user-1',
        weightedScore: 100,
        recommendation: InterviewRecommendation.STRONG_YES,
        strengths: 'Su edad encaja con el equipo',
        concerns: null,
        comments: null,
        responses: [{
          criterionKey: 'TECH',
          criterionLabel: 'Técnica',
          criterionType: ScorecardCriterionType.RATING,
          rating: 5,
          evidence: null,
          textValue: null,
        }],
      },
      {
        id: 'scorecard-2',
        reviewerUserId: 'user-2',
        weightedScore: 40,
        recommendation: InterviewRecommendation.NO,
        strengths: null,
        concerns: null,
        comments: null,
        responses: [{
          criterionKey: 'TECH',
          criterionLabel: 'Técnica',
          criterionType: ScorecardCriterionType.RATING,
          rating: 2,
          evidence: 'No resolvió el caso',
          textValue: null,
        }],
      },
    ], [{ key: 'TECH', label: 'Técnica', spread: 3 }]);

    expect(signals.map((item) => item.code)).toEqual(expect.arrayContaining([
      'EVALUATOR_DISAGREEMENT',
      'POTENTIALLY_SENSITIVE_LANGUAGE',
      'EXTREME_WITHOUT_EVIDENCE',
    ]));
  });
});
