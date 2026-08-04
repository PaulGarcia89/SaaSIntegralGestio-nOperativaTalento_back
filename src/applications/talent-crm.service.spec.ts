import { BadRequestException } from '@nestjs/common';
import { AccessScope } from '../common/enums/access-scope.enum';
import { TalentCrmService } from './talent-crm.service';

describe('TalentCrmService', () => {
  const actor = {
    sub: 'recruiter-1', scope: AccessScope.BRANCH, isSuperAdmin: false,
    allowedBranchIds: ['branch-1'], roles: ['RECRUITER'], role: 'RECRUITER',
  } as never;

  it('detecta coincidencias explicables y conserva el alcance de sucursal', async () => {
    const prisma = {
      candidate: {
        findMany: jest.fn().mockResolvedValue([
          candidate('candidate-1', 'Ana Pérez', 'ana@example.test', '+1 305 555 0100', 'cv-a'),
          candidate('candidate-2', 'Ana Perez', 'ana.alt@example.test', '3055550100', 'cv-b'),
          candidate('candidate-3', 'Persona Distinta', 'otra@example.test', '+1 786 555 9999', 'cv-c'),
        ]),
      },
    };
    const service = new TalentCrmService(prisma as never);

    const result = await service.findDuplicates(actor, 'tenant-1', { minimumScore: 45 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ score: 85, signals: ['Teléfono idéntico', 'Nombre idéntico', 'Ciudad idéntica'] });
    expect(prisma.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        applications: { some: { vacancy: { branchId: { in: ['branch-1'] } } } },
      }),
    }));
  });

  it('bloquea una fusión cuando existen postulaciones para la misma vacante', async () => {
    const prisma = {
      candidate: { findFirst: jest.fn().mockResolvedValueOnce(baseCandidate('source')).mockResolvedValueOnce(baseCandidate('target')) },
      vacancyApplication: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'application-source', vacancyId: 'vacancy-1' }])
          .mockResolvedValueOnce([{ vacancyId: 'vacancy-1' }]),
      },
      $transaction: jest.fn(),
    };
    const service = new TalentCrmService(prisma as never);

    await expect(service.mergeCandidates(actor, 'tenant-1', {
      sourceCandidateId: 'source', targetCandidateId: 'target', reason: 'Coincidencia validada manualmente',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function candidate(id: string, fullName: string, email: string, phone: string, sha256: string) {
  return {
    id, fullName, email, phone, city: 'Miami', linkedinUrl: null, updatedAt: new Date(),
    resumeFiles: [{ sha256 }], applications: [{ vacancyId: `vacancy-${id}` }],
  };
}

function baseCandidate(id: string) {
  return {
    id, tenantId: 'tenant-1', accountId: null, fullName: id, email: `${id}@example.test`, phone: null,
    city: null, linkedinUrl: null, portfolioUrl: null, resumeUrl: null, crmStatus: 'ACTIVE', source: null,
    doNotContact: false, mergedIntoId: null, mergedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
}
