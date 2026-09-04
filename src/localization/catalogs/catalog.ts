import { en } from './en';
import { es } from './es';
import { SupportedLocale } from '../localization.service';

export const catalogs = { es, en } as const;
export type MessageCode =
  | 'common.unexpected_error'
  | 'common.validation_error'
  | 'common.unauthorized'
  | 'common.forbidden'
  | 'common.not_found'
  | 'vacancies.public_title'
  | 'vacancies.private_access_required'
  | 'applications.submitted'
  | 'applications.already_submitted'
  | 'dashboard.review_application'
  | 'dashboard.prepare_interview'
  | 'applications_ats.no_undoable_transition'
  | 'applications_ats.previous_stage_gone'
  | 'hiring_progress.docs_missing_one'
  | 'hiring_progress.docs_missing_many'
  | 'hiring_progress.signatures_pending'
  | 'hiring_progress.waiting_candidate'
  | 'hiring_progress.offer_not_configured'
  | 'hiring_progress.activity_create'
  | 'hiring_progress.activity_send_offer'
  | 'hiring_progress.activity_accept_offer'
  | 'hiring_progress.activity_reject_offer'
  | 'hiring_progress.activity_confirm'
  | 'hiring_progress.activity_cancel'
  | 'hiring_progress.activity_update';

export type NotificationMessageCode =
  | 'candidate_hired'
  | 'application_stage_changed'
  | 'application_rejected'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'branch_changed'
  | 'offboarding_started'
  | 'onboarding_completed'
  | 'asset_assigned'
  | 'training_completed'
  | 'handoff_completed'
  | 'compliance_closed';

/**
 * `params` interpola `{{nombre}}`, igual que el `translate` del frontend.
 *
 * Hace falta para los mensajes con cantidades: en singular y plural el numero
 * no va en el mismo sitio en todos los idiomas, asi que concatenar no sirve.
 */
export function message(code: MessageCode, locale: SupportedLocale, fallback: SupportedLocale = 'es', params: Record<string, string | number> = {}): string {
  const lookup = (selected: SupportedLocale) => code.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined), catalogs[selected]);
  const result = lookup(locale) ?? lookup(fallback) ?? lookup('es');
  if (typeof result !== 'string') return code;
  return result.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`));
}

export function notificationMessage(code: NotificationMessageCode, locale: SupportedLocale) {
  const selected = catalogs[locale].notifications[code] ?? catalogs.es.notifications[code];
  return selected;
}
