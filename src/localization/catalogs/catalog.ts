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
  | 'applications.already_submitted';

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

export function message(code: MessageCode, locale: SupportedLocale, fallback: SupportedLocale = 'es'): string {
  const lookup = (selected: SupportedLocale) => code.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined), catalogs[selected]);
  const result = lookup(locale) ?? lookup(fallback) ?? lookup('es');
  return typeof result === 'string' ? result : code;
}

export function notificationMessage(code: NotificationMessageCode, locale: SupportedLocale) {
  const selected = catalogs[locale].notifications[code] ?? catalogs.es.notifications[code];
  return selected;
}
