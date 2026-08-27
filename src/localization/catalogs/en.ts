export const en = {
  common: {
    unexpected_error: 'An unexpected error occurred.',
    validation_error: 'Review the submitted data.',
    unauthorized: 'Your session is not valid.',
    forbidden: 'You do not have permission to perform this action.',
    not_found: 'The requested resource was not found.',
  },
  vacancies: {
    public_title: 'Available jobs',
    private_access_required: 'This job requires authorized access.',
  },
  applications: {
    submitted: 'Your application was submitted successfully.',
    already_submitted: 'An application already exists for this job.',
  },
  notifications: {
    candidate_hired: { title: 'Hiring confirmed', message: 'Hiring was confirmed and onboarding has started.' },
    application_stage_changed: { title: 'Application stage updated', message: 'An application changed stage in the pipeline.' },
    application_rejected: { title: 'Application rejected', message: 'An application was rejected in the selection process.' },
    interview_scheduled: { title: 'Interview scheduled', message: 'An interview was scheduled for an application.' },
    interview_completed: { title: 'Interview completed', message: 'An interview is ready for evaluation.' },
    branch_changed: { title: 'Branch changed', message: 'The assigned branch was updated and related tasks are being recalculated.' },
    offboarding_started: { title: 'Offboarding started', message: 'Access closure and asset recovery are being tracked.' },
    onboarding_completed: { title: 'Onboarding completed', message: 'All required onboarding tasks were completed.' },
    asset_assigned: { title: 'Asset assigned', message: 'A new inventory assignment was recorded.' },
    training_completed: { title: 'Training completed', message: 'The training activity was completed successfully.' },
    handoff_completed: { title: 'Operational handoff completed', message: 'The operational handoff was confirmed.' },
    compliance_closed: { title: 'Compliance control closed', message: 'The required control was closed with traceability.' },
  },
} as const;
