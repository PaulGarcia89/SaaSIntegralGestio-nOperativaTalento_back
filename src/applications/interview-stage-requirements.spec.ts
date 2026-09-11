import { assertInterviewStageRequirements as check } from './interview-stage-requirements';
const interview = { status: 'SCHEDULED', startsAt: new Date('2030-01-01T10:00:00Z'), endsAt: new Date('2030-01-01T11:00:00Z'), interviewerUserId: 'user' };
describe('Interview stage requirements', () => {
  it.each(['CANCELED', 'NO_SHOW'])('rejects %s interviews', (status) => {
    expect(() => check({ status: 'REVIEWING', interviews: [{ ...interview, status }] }, 'INTERVIEW')).toThrow('Agenda');
  });
  it('requires a real appointment', () => {
    expect(() => check({ status: 'REVIEWING' }, 'INTERVIEW')).toThrow('Agenda');
    expect(() => check({ status: 'REVIEWING', interviews: [{ ...interview, endsAt: interview.startsAt }] }, 'INTERVIEW')).toThrow('Agenda');
    expect(() => check({ status: 'REVIEWING', interviews: [interview] }, 'INTERVIEW')).not.toThrow();
  });
  it('blocks approval until the interview is completed, including skipped interview stages', () => {
    expect(() => check({ status: 'INTERVIEW', interviews: [interview] }, 'APPROVED')).toThrow('Completa');
    expect(() => check({ status: 'REVIEWING', vacancy: { stages: [{ applicationStatus: 'INTERVIEW' }] } }, 'APPROVED')).toThrow('Completa');
    expect(() => check({ status: 'INTERVIEW', interviews: [{ ...interview, status: 'COMPLETED' }] }, 'APPROVED')).not.toThrow();
  });
  it('preserves processes without interviews and rejection', () => {
    expect(() => check({ status: 'REVIEWING' }, 'APPROVED')).not.toThrow();
    expect(() => check({ status: 'INTERVIEW' }, 'REJECTED')).not.toThrow();
  });
});
