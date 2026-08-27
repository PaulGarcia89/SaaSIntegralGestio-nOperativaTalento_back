export const es = {
  common: {
    unexpected_error: 'Ocurrió un error inesperado.',
    validation_error: 'Revisa los datos enviados.',
    unauthorized: 'Tu sesión no es válida.',
    forbidden: 'No tienes permisos para realizar esta acción.',
    not_found: 'No se encontró el recurso solicitado.',
  },
  vacancies: {
    public_title: 'Vacantes disponibles',
    private_access_required: 'Esta vacante requiere acceso autorizado.',
  },
  applications: {
    submitted: 'Tu postulación fue enviada correctamente.',
    already_submitted: 'Ya existe una postulación para esta vacante.',
  },
  notifications: {
    candidate_hired: { title: 'Contratación confirmada', message: 'La contratación fue confirmada y el flujo de incorporación comenzó.' },
    application_stage_changed: { title: 'Etapa de candidatura actualizada', message: 'Una candidatura cambió de etapa en el pipeline.' },
    application_rejected: { title: 'Candidatura descartada', message: 'Se registró un descarte en el proceso de selección.' },
    interview_scheduled: { title: 'Entrevista programada', message: 'Se agendó una entrevista para una candidatura.' },
    interview_completed: { title: 'Entrevista completada', message: 'Una entrevista está lista para evaluación.' },
    branch_changed: { title: 'Cambio de sucursal', message: 'Se actualizó la sucursal asignada y se están recalculando las tareas relacionadas.' },
    offboarding_started: { title: 'Proceso de salida iniciado', message: 'El cierre de accesos y la recuperación de activos quedaron en seguimiento.' },
    onboarding_completed: { title: 'Incorporación completada', message: 'Todas las tareas obligatorias de incorporación fueron completadas.' },
    asset_assigned: { title: 'Activo asignado', message: 'Se registró una nueva asignación de inventario.' },
    training_completed: { title: 'Capacitación completada', message: 'La actividad formativa fue completada correctamente.' },
    handoff_completed: { title: 'Entrega operativa completada', message: 'La transferencia operativa fue confirmada.' },
    compliance_closed: { title: 'Control de cumplimiento cerrado', message: 'El control obligatorio fue cerrado con trazabilidad.' },
  },
} as const;
