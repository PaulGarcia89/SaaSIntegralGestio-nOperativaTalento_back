import { HiringProgressResolver } from './hiring-progress.resolver';

describe('HiringProgressResolver', () => {
  const resolver = new HiringProgressResolver();

  it('preserves the legacy progress fields and exposes the UX contract', () => {
    const progress = resolver.resolve({
      status: 'DOCUMENTS_PENDING',
      currentStage: 'documents_pending',
      nextActor: 'HR',
      documents: [
        { required: true, status: 'REQUESTED' },
        { required: true, status: 'APPROVED' },
      ],
      signatures: [{ status: 'PENDING' }],
    });

    expect(progress).toMatchObject({
      currentStage: 'documents_pending',
      displayStatus: 'Documentos pendientes',
      progressPercent: 63,
      progressPercentage: 63,
      tasksCompleted: progress.completedTasks,
      tasksPending: progress.pendingTasks,
      actorResponsible: 'HR',
      responsibleActor: { code: 'HR', label: 'Recursos Humanos' },
      nextAction: expect.objectContaining({ code: 'REVIEW_DOCUMENTS', enabled: false }),
      requiredDocumentsSummary: { total: 2, completed: 1, pending: 1, blocked: true },
      signaturesSummary: { total: 1, completed: 0, pending: 1, operationStatus: 'pending' },
    });
  });

  it('returns stable action codes and human-readable activity descriptions', () => {
    const progress = resolver.resolve({ status: 'OFFER_PREPARATION', currentStage: 'offer_preparation', jobOfferId: 'offer-1' });

    expect(progress.nextAction).toMatchObject({ code: 'SEND_OFFER', enabled: true });
    expect(progress.availableActions).toEqual([expect.objectContaining({ code: 'SEND_OFFER' })]);
    expect(resolver.describeActivity({ action: 'SEND_OFFER' })).toBe('Se envió la oferta al candidato.');
  });
});
