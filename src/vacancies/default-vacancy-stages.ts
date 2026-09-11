import { CreateVacancyStageDto } from './dto/create-vacancy.dto';

/** A vacancy always starts with a usable selection process. */
export function defaultVacancyStages(): CreateVacancyStageDto[] {
  return [
    { code: 'APPLIED', name: 'Postulación', position: 0, applicationStatus: 'SUBMITTED', allowedNextStageCodes: ['SCREENING', 'REJECTED'], slaHours: 24 },
    { code: 'SCREENING', name: 'Revisión inicial', position: 1, applicationStatus: 'REVIEWING', allowedNextStageCodes: ['INTERVIEW', 'REJECTED'], requiredFields: ['candidate.phone', 'candidate.resumeUrl'], slaHours: 48 },
    { code: 'INTERVIEW', name: 'Entrevistas', position: 2, applicationStatus: 'INTERVIEW', allowedNextStageCodes: ['DECISION', 'REJECTED'], slaHours: 72 },
    { code: 'DECISION', name: 'Decisión', position: 3, applicationStatus: 'APPROVED', allowedNextStageCodes: ['HIRED', 'REJECTED'], requiredFields: ['interview.completed', 'scorecard'], requiresApproval: true, requiredApprovals: 1, slaHours: 48 },
    { code: 'REJECTED', name: 'No continúa', position: 4, applicationStatus: 'REJECTED', isTerminal: true, allowedNextStageCodes: ['SCREENING'], allowReopen: true },
    { code: 'HIRED', name: 'Contratación', position: 5, applicationStatus: 'HIRED', isTerminal: true, allowedNextStageCodes: [] },
  ];
}
