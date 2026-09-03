const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  DATA_REVIEW: 'Revisión de datos',
  OFFER_PREPARATION: 'Preparando oferta',
  OFFER_SENT: 'Oferta enviada',
  AWAITING_OFFER_RESPONSE: 'Esperando respuesta del candidato',
  OFFER_ACCEPTED: 'Oferta aceptada',
  DOCUMENTS_PENDING: 'Documentos pendientes',
  SIGNATURES_PENDING: 'Firmas pendientes',
  COMPLIANCE_REVIEW: 'Revisión de cumplimiento',
  READY_TO_HIRE: 'Listo para contratar',
  HIRED: 'Contratado',
  CANCELLED: 'Cancelado',
};

const ACTIONS: Record<string, { code: string; label: string; description: string; role: string; endpoint?: string }> = {
  DATA_REVIEW: { code: 'REVIEW_DATA', label: 'Revisar datos', description: 'Verifica los datos del candidato, la postulación y la vacante.', role: 'HR', endpoint: 'PATCH /api/hiring/:id' },
  OFFER_PREPARATION: { code: 'SEND_OFFER', label: 'Enviar oferta al candidato', description: 'La oferta está configurada y puede enviarse.', role: 'HR', endpoint: 'POST /api/hiring/:id/offer/send' },
  OFFER_SENT: { code: 'WAIT_CANDIDATE', label: 'Esperar respuesta del candidato', description: 'La oferta fue enviada y requiere una respuesta.', role: 'CANDIDATE' },
  AWAITING_OFFER_RESPONSE: { code: 'WAIT_CANDIDATE', label: 'Esperar respuesta del candidato', description: 'La oferta continúa pendiente de respuesta.', role: 'CANDIDATE' },
  OFFER_ACCEPTED: { code: 'REQUEST_DOCUMENTS', label: 'Solicitar documentos', description: 'Solicita los requisitos documentales de la contratación.', role: 'HR', endpoint: 'POST /api/hiring/:id/documents' },
  DOCUMENTS_PENDING: { code: 'REVIEW_DOCUMENTS', label: 'Revisar documentos', description: 'Recibe y revisa los documentos obligatorios.', role: 'HR', endpoint: 'PATCH /api/hiring/:id/documents/:documentId' },
  SIGNATURES_PENDING: { code: 'REVIEW_SIGNATURES', label: 'Revisar firmas', description: 'Espera la finalización de las solicitudes de firma.', role: 'HR' },
  COMPLIANCE_REVIEW: { code: 'CONFIRM_HIRING', label: 'Confirmar contratación', description: 'Confirma la contratación cuando todos los requisitos estén completos.', role: 'HR', endpoint: 'POST /api/hiring/:id/confirm' },
  READY_TO_HIRE: { code: 'CONFIRM_HIRING', label: 'Confirmar contratación', description: 'La contratación está lista para crear o vincular al empleado.', role: 'HR', endpoint: 'POST /api/hiring/:id/confirm' },
  HIRED: { code: 'VIEW_ONBOARDING', label: 'Consultar onboarding', description: 'Consulta el proceso de incorporación del empleado.', role: 'HR' },
};

const ORDER = ['DATA_REVIEW', 'OFFER_PREPARATION', 'OFFER_SENT', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW', 'HIRED'];

export class HiringProgressResolver {
  resolve(contract: any) {
    const status = String(contract.status ?? 'DRAFT');
    const documents = Array.isArray(contract.documents) ? contract.documents : [];
    const signatures = Array.isArray(contract.signatures) ? contract.signatures : [];
    const requiredDocuments = documents.filter((document: any) => document.required);
    const completedDocuments = requiredDocuments.filter((document: any) => ['APPROVED', 'SIGNED', 'WAIVED'].includes(document.status));
    const pendingDocuments = requiredDocuments.filter((document: any) => !['APPROVED', 'SIGNED', 'WAIVED'].includes(document.status));
    const completed = ORDER.filter((step) => this.stepComplete(status, step));
    const pending = ORDER.filter((step) => !this.stepComplete(status, step));
    const blockers = this.blockers(status, pendingDocuments, signatures);
    const next = ACTIONS[status] ?? ACTIONS.DATA_REVIEW;
    const actionBlockers = status === 'OFFER_PREPARATION' && !contract.jobOfferId
      ? [{ code: 'OFFER_NOT_CONFIGURED', message: 'Configura una oferta antes de enviarla.', field: 'jobOfferId' }]
      : blockers;
    const lastActivity = this.lastActivity(contract);
    const progressPercentage = Math.round((completed.length / ORDER.length) * 100);
    const availableActions = Object.values(ACTIONS).filter((action) => this.isAvailable(action.code, status, actionBlockers));

    return {
      currentStage: contract.currentStage,
      displayStatus: STATUS_LABELS[status] ?? status,
      progressPercent: progressPercentage,
      progressPercentage,
      tasksCompleted: completed.map((step) => STATUS_LABELS[step] ?? step),
      completedTasks: completed.map((step) => STATUS_LABELS[step] ?? step),
      tasksPending: pending.map((step) => STATUS_LABELS[step] ?? step),
      pendingTasks: pending.map((step) => STATUS_LABELS[step] ?? step),
      blockers,
      nextAction: { ...next, enabled: actionBlockers.length === 0, blockers: actionBlockers },
      actorResponsible: contract.nextActor ?? next.role,
      responsibleActor: { type: 'ROLE', code: contract.nextActor ?? next.role, label: this.actorLabel(contract.nextActor ?? next.role) },
      lastActivity,
      availableActions,
      requiredDocumentsSummary: { total: requiredDocuments.length, completed: completedDocuments.length, pending: pendingDocuments.length, blocked: pendingDocuments.length > 0 },
      signaturesSummary: { total: signatures.length, completed: signatures.filter((signature: any) => ['COMPLETED', 'SIGNED'].includes(signature.status)).length, pending: signatures.filter((signature: any) => !['COMPLETED', 'SIGNED', 'EXPIRED', 'CANCELLED'].includes(signature.status)).length, operationStatus: this.operationStatus(signatures) },
    };
  }

  isBlockedStatus(status: string) { return ['OFFER_SENT', 'AWAITING_OFFER_RESPONSE', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW'].includes(status); }

  describeActivity(event: any) { return this.activityDescription(event); }

  private stepComplete(status: string, step: string) {
    const index = ORDER.indexOf(step);
    return index >= 0 && ORDER.indexOf(status) >= index;
  }

  private blockers(status: string, pendingDocuments: any[], signatures: any[]) {
    const blockers: Array<{ code: string; message: string; field?: string }> = [];
    if (['DOCUMENTS_PENDING', 'COMPLIANCE_REVIEW', 'READY_TO_HIRE'].includes(status) && pendingDocuments.length) blockers.push({ code: 'REQUIRED_DOCUMENTS_MISSING', message: `Faltan ${pendingDocuments.length} documento(s) obligatorio(s).` });
    if (status === 'SIGNATURES_PENDING' && signatures.some((signature: any) => ['PENDING', 'PROCESSING', 'RETRYING'].includes(signature.status))) blockers.push({ code: 'SIGNATURES_PENDING', message: 'Hay solicitudes de firma pendientes.' });
    if (status === 'OFFER_SENT' || status === 'AWAITING_OFFER_RESPONSE') blockers.push({ code: 'WAITING_CANDIDATE', message: 'La contratación está esperando una respuesta del candidato.' });
    return blockers;
  }

  private isAvailable(code: string, status: string, blockers: any[]) { return code === (ACTIONS[status]?.code ?? '') && blockers.length === 0; }

  private operationStatus(signatures: any[]) {
    if (!signatures.length) return 'pending';
    if (signatures.every((signature: any) => ['COMPLETED', 'SIGNED'].includes(signature.status))) return 'completed';
    if (signatures.some((signature: any) => ['FAILED', 'ERROR'].includes(signature.status))) return 'failed';
    if (signatures.some((signature: any) => ['COMPLETED', 'SIGNED'].includes(signature.status))) return 'partially_completed';
    return 'pending';
  }

  private lastActivity(contract: any) {
    const event = Array.isArray(contract.stateHistory)
      ? contract.stateHistory.reduce((latest: any, candidate: any) => !latest || new Date(candidate.occurredAt).getTime() > new Date(latest.occurredAt).getTime() ? candidate : latest, null)
      : contract.stateHistory;
    if (!event) return null;
    return { action: event.action, description: this.activityDescription(event), occurredAt: event.occurredAt, actorUserId: event.actorUserId ?? null };
  }

  private activityDescription(event: any) {
    const descriptions: Record<string, string> = { CREATE_CONTRACT: 'Se creó la contratación.', SEND_OFFER: 'Se envió la oferta al candidato.', ACCEPT_OFFER: 'El candidato aceptó la oferta.', REJECT_OFFER: 'El candidato rechazó la oferta.', CONFIRM_CONTRACT: 'Se confirmó la contratación.', CANCEL_CONTRACT: 'Se canceló la contratación.' };
    return descriptions[event.action] ?? 'Se actualizó la contratación.';
  }

  private actorLabel(code: string) { return code === 'CANDIDATE' ? 'Candidato' : code === 'HR' ? 'Recursos Humanos' : code; }
}
