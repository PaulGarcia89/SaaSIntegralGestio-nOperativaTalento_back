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

  it('devuelve los bloqueos en el idioma pedido', () => {
    const contract = { status: 'DOCUMENTS_PENDING', currentStage: 'documents_pending', documents: [{ required: true, status: 'REQUIRED' }, { required: true, status: 'REQUIRED' }] };
    expect(resolver.resolve(contract, 'es').blockers[0].message).toBe('Faltan 2 documentos obligatorios.');
    expect(resolver.resolve(contract, 'en').blockers[0].message).toBe('2 required documents are missing.');
  });

  it('usa el singular cuando falta un solo documento', () => {
    const contract = { status: 'DOCUMENTS_PENDING', currentStage: 'documents_pending', documents: [{ required: true, status: 'REQUIRED' }] };
    expect(resolver.resolve(contract, 'es').blockers[0].message).toBe('Falta 1 documento obligatorio.');
    expect(resolver.resolve(contract, 'en').blockers[0].message).toBe('1 required document is missing.');
  });
});
