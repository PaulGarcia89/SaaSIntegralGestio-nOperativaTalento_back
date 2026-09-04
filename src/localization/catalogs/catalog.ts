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
  | 'hiring_progress.activity_update'
  | 'applications_public.referral_vacancy_unavailable'
  | 'applications_public.could_not_validate'
  | 'applications_public.slow_down'
  | 'applications_public.too_many_attempts'
  | 'applications_public.evidence_disclaimer'
  | 'applications_public.modified_elsewhere'
  | 'applications_public.resume_upload_unavailable'
  | 'applications_public.candidate_profile_not_found'
  | 'talent_crm.suppressed_unsubscribed'
  | 'talent_crm.suggestion_reason'
  | 'talent_crm.campaign_needs_review'
  | 'talent_crm.audience_reviewed'
  | 'talent_crm.audience_not_recomputable'
  | 'talent_crm.suppressed_do_not_contact'
  | 'talent_crm.suppressed_no_consent'
  | 'talent_crm.suppressed_no_application'
  | 'talent_crm.confirm_audience'
  | 'talent_crm.prepare_audience_first'
  | 'talent_crm.audience_changed'
  | 'talent_crm.review_audience_first'
  | 'talent_crm.step_count_mismatch'
  | 'talent_crm.signal_same_email'
  | 'talent_crm.signal_same_phone'
  | 'talent_crm.signal_same_linkedin'
  | 'talent_crm.signal_same_resume'
  | 'talent_crm.signal_same_name'
  | 'talent_crm.signal_same_city'
  | 'application_sla.escalated_title'
  | 'application_sla.escalated_detail'
  | 'application_sla.warning_title'
  | 'application_sla.warning_detail'
  | 'application_sla.reassigned_title'
  | 'application_sla.reassigned_detail'
  | 'scope.tenant_out_of_scope'
  | 'scope.branch_out_of_scope'
  | 'scope.branch_not_found'
  | 'scope.vacancy_not_found'
  | 'scope.recruiter_not_found'
  | 'scope.invalid_date_range'
  | 'scope.period_too_long'
  | 'ats_analytics.source'
  | 'ats_analytics.source_unattributed'
  | 'ats_analytics.no_structured_reason'
  | 'ats_analytics.csv_summary'
  | 'ats_analytics.csv_applications'
  | 'ats_analytics.csv_unique_candidates'
  | 'ats_analytics.csv_hires'
  | 'ats_analytics.csv_conversion'
  | 'ats_analytics.csv_time_to_hire'
  | 'ats_analytics.csv_hours'
  | 'ats_analytics.csv_sla_compliance'
  | 'ats_analytics.csv_funnel'
  | 'ats_analytics.csv_source'
  | 'ats_analytics.csv_quality_of_hire'
  | 'ats_analytics.csv_days'
  | 'ats_analytics.csv_retention'
  | 'ats_analytics.csv_vacancy'
  | 'ats_analytics.csv_recruiter'
  | 'ats_analytics.csv_rejection'
  | 'ats_analytics.csv_dimension'
  | 'ats_analytics.csv_indicator'
  | 'ats_analytics.csv_value'
  | 'ats_analytics.csv_detail'
  | 'ats_analytics.csv_filename'
  | 'ats_analytics.insight_bottleneck_title'
  | 'ats_analytics.insight_bottleneck_detail'
  | 'ats_analytics.insight_dropoff_title'
  | 'ats_analytics.insight_dropoff_detail'
  | 'ats_analytics.insight_source_title'
  | 'ats_analytics.insight_source_detail'
  | 'ats_analytics.insight_sla_title'
  | 'ats_analytics.insight_sla_detail'
  | 'ats_analytics.insight_noshow_title'
  | 'ats_analytics.insight_noshow_detail'
  | 'ats_analytics.insight_offer_title'
  | 'ats_analytics.insight_offer_detail'
  | 'offers.email_default_message'
  | 'offers.email_review_and_sign'
  | 'offers.application_must_be_approved'
  | 'offers.already_active'
  | 'offers.no_more_versions'
  | 'offers.not_pending_approval'
  | 'offers.approval_not_found'
  | 'offers.approval_other_user'
  | 'offers.only_company_admins'
  | 'offers.needs_both_approvals'
  | 'offers.validity_already_ended'
  | 'offers.accepted_cannot_cancel'
  | 'offers.no_signature_request'
  | 'offers.acceptance_needs_consent'
  | 'offers.acceptance_needs_signature'
  | 'offers.conversion_failed'
  | 'offers.not_accepted_yet'
  | 'offers.signature_incomplete'
  | 'offers.not_found'
  | 'offers.application_not_found'
  | 'offers.branch_out_of_scope'
  | 'offers.invalid_dates'
  | 'offers.validity_must_be_future'
  | 'offers.current_version_not_found'
  | 'offers.version_not_found'
  | 'offers.not_available_to_respond'
  | 'offers.expired'
  | 'ats_comms.application_confirmation_subject'
  | 'ats_comms.application_confirmation_body'
  | 'ats_comms.stage_update_subject'
  | 'ats_comms.stage_update_body'
  | 'ats_comms.rejection_subject'
  | 'ats_comms.rejection_body'
  | 'ats_comms.interview_scheduled_subject'
  | 'ats_comms.interview_scheduled_body'
  | 'ats_comms.interview_reminder_subject'
  | 'ats_comms.interview_reminder_body'
  | 'ats_comms.interview_rescheduled_subject'
  | 'ats_comms.interview_rescheduled_body'
  | 'ats_comms.interview_cancelled_subject'
  | 'ats_comms.interview_cancelled_body'
  | 'ats_comms.offer_subject'
  | 'ats_comms.offer_body'
  | 'ats_comms.approval_subject'
  | 'ats_comms.approval_body'
  | 'ats_comms.generic_subject'
  | 'ats_comms.generic_body'
  | 'ats_comms.category_disabled'
  | 'ats_comms.email_channel_disabled';

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

/**
 * Traduce el mensaje de una excepcion cuando el servicio lanzo una CLAVE de
 * catalogo ('offers.expired') en vez de texto suelto. Si la cadena no es una
 * clave conocida se devuelve intacta, de modo que los mensajes que todavia
 * estan escritos en castellano siguen comportandose igual que antes.
 *
 * Esto evita arrastrar el idioma por la firma de cada metodo privado del
 * servicio: el filtro global ya tiene el `request.locale` que puso el
 * LocaleMiddleware. El contrato de la API no cambia: el cuerpo del error sigue
 * siendo { code, message } con `code` estable en ingles.
 */
export function localizeMessage(value: string, locale: SupportedLocale): string {
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(value)) return value;
  const translated = message(value as MessageCode, locale);
  return translated === value ? value : translated;
}

export function notificationMessage(code: NotificationMessageCode, locale: SupportedLocale) {
  const selected = catalogs[locale].notifications[code] ?? catalogs.es.notifications[code];
  return selected;
}
