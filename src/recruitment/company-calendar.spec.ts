import { CalendarProvider } from '@prisma/client';
import { CalendarTokenCryptoService } from './calendar-token-crypto.service';
import { InterviewCalendarService } from './interview-calendar.service';
import { CompanyCalendarSettingsService } from './company-calendar-settings.service';
import { buildInterviewInvitation } from './interview-invitation';

const actor = { sub: 'admin', tenantId: 'tenant' } as never;
describe('Company calendar OAuth', () => {
  const crypto = new CalendarTokenCryptoService();
  const saved = { clientId: 'client', clientSecretEncrypted: crypto.encrypt('secret'), authority: 'common' };
  function setup() {
    const prisma = { tenantCalendarProviderSettings: { upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, atsCalendarConnection: { findFirst: jest.fn() } };
    const settings = { config: jest.fn().mockResolvedValue(saved), assertProvider: jest.fn() };
    return { prisma, service: new InterviewCalendarService(prisma as never, crypto, settings as never) };
  }
  it('opens the official Google login with offline access and a one-time tenant state', async () => {
    const { prisma, service } = setup();
    const result = await service.getAuthorizationUrl('tenant', actor, CalendarProvider.GOOGLE, 'http://localhost/admin/company/calendar', true);
    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('client_id')).toBe('client');
    expect(result.authorizationUrl).not.toContain('secret');
    expect(crypto.verifyState(result.state)).toMatchObject({ tenantId: 'tenant', userId: 'admin', companyManaged: true });
    expect(prisma.tenantCalendarProviderSettings.upsert).toHaveBeenCalled();
  });
  it('rejects unapproved callback URLs before creating state', async () => {
    const { service, prisma } = setup();
    await expect(service.getAuthorizationUrl('tenant', actor, CalendarProvider.GOOGLE, 'https://attacker.example/callback', true)).rejects.toThrow();
    expect(prisma.tenantCalendarProviderSettings.upsert).not.toHaveBeenCalled();
  });
  it('rejects replayed authorization without exchanging tokens', async () => {
    const { service, prisma } = setup();
    const { state } = await service.getAuthorizationUrl('tenant', actor, CalendarProvider.GOOGLE, 'http://localhost/admin/company/calendar', true);
    prisma.tenantCalendarProviderSettings.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.exchangeAuthorizationCode('tenant', actor, CalendarProvider.GOOGLE, { code: 'code', state, redirectUri: 'http://localhost/admin/company/calendar' }, true)).rejects.toThrow('ya fue utilizada');
  });
  it('rejects a callback for another company or user', async () => {
    const { service, prisma } = setup();
    const { state } = await service.getAuthorizationUrl('tenant', actor, CalendarProvider.GOOGLE, 'http://localhost/admin/company/calendar', true);
    for (const [tenant, user] of [['other', actor], ['tenant', { sub: 'other' }]]) {
      await expect(service.exchangeAuthorizationCode(tenant as string, user as never, CalendarProvider.GOOGLE, { code: 'code', state, redirectUri: 'http://localhost/admin/company/calendar' }, true)).rejects.toThrow('does not match');
    }
    expect(prisma.tenantCalendarProviderSettings.updateMany).not.toHaveBeenCalled();
  });
  it('does not allow the personal endpoint to consume a company authorization', async () => {
    const { service } = setup();
    const { state } = await service.getAuthorizationUrl('tenant', actor, CalendarProvider.GOOGLE, 'http://localhost/admin/company/calendar', true);
    await expect(service.exchangeAuthorizationCode('tenant', actor, CalendarProvider.GOOGLE, { code: 'code', state, redirectUri: 'http://localhost/admin/company/calendar' })).rejects.toThrow();
  });
  it('never resolves a connection belonging to a different company', async () => {
    const prisma = { tenantCalendarProviderSettings: { findUnique: jest.fn().mockResolvedValue({ connectionId: 'foreign' }) }, atsCalendarConnection: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new CompanyCalendarSettingsService(prisma as never, crypto);
    await expect(service.resolve('tenant', 'admin', CalendarProvider.GOOGLE)).rejects.toThrow('Conecta');
    expect(prisma.atsCalendarConnection.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', tenantId: 'tenant', provider: 'GOOGLE', status: 'ACTIVE' } });
  });
});

describe('Interview invitation', () => {
  const interview = { id: '123', title: 'Entrevista de selección '.repeat(8), status: 'SCHEDULED', startsAt: new Date('2026-09-15T14:00:00Z'), endsAt: new Date('2026-09-15T15:00:00Z'), icsSequence: 0, interviewer: { email: 'admin@example.com' }, application: { candidate: { email: 'candidate@example.com' }, vacancy: { title: 'Recepción' } }, reminderMinutes: 30, additionalAttendees: ['admin@example.com', 'panel@example.com'] };
  it('uses UTC, a stable UID, unique attendees and a reminder', () => {
    const result = buildInterviewInvitation(interview);
    expect(result.content).toContain('DTSTART:20260915T140000Z');
    expect(result.content).toContain('UID:123@talentos');
    expect(result.content.match(/ATTENDEE/g)).toHaveLength(3);
    expect(result.content).toContain('TRIGGER:-PT30M');
    expect(result.content.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
  it('retains UID on reschedule and cancels with a higher sequence', () => {
    const result = buildInterviewInvitation({ ...interview, status: 'CANCELED', icsSequence: 2 });
    expect(result.method).toBe('CANCEL');
    expect(result.content).toContain('UID:123@talentos');
    expect(result.content).toContain('SEQUENCE:2');
    expect(result.content).not.toContain('VALARM');
  });
  it('escapes injected event properties', () => {
    const result = buildInterviewInvitation({ ...interview, title: 'Title\r\nATTENDEE:evil@example.com' });
    expect(result.content).not.toContain('\r\nATTENDEE:evil');
  });
});

describe('Google interview events', () => {
  afterEach(() => jest.restoreAllMocks());
  function setup() {
    const crypto = new CalendarTokenCryptoService();
    const interview = { id: '123e4567-e89b-12d3-a456-426614174000', tenantId: 'tenant', interviewerUserId: 'user', calendarConnectionId: 'connection', externalCalendarId: 'team@example.com', calendarProvider: 'GOOGLE', videoProvider: 'GOOGLE_MEET', title: 'Entrevista Recepción', startsAt: new Date('2026-09-15T14:00:00Z'), endsAt: new Date('2026-09-15T15:00:00Z'), timezone: 'America/New_York', status: 'SCHEDULED', icsSequence: 0, reminderMinutes: 30, interviewer: { email: 'lead@example.com' }, application: { candidate: { email: 'candidate@example.com' } }, participants: [{ user: { email: 'lead@example.com' } }], additionalAttendees: ['extra@example.com'] };
    const prisma = { applicationInterview: { findFirst: jest.fn().mockResolvedValue(interview), update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) }, atsCalendarConnection: { findFirst: jest.fn().mockResolvedValue({ id: 'connection', status: 'ACTIVE', accessTokenEncrypted: crypto.encrypt('token') }) } };
    return { service: new InterviewCalendarService(prisma as never, crypto), prisma, interview };
  }
  it('creates Meet with a stable event ID and unique invitees in the selected calendar', async () => {
    const { service } = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'event', hangoutLink: 'https://meet.google.com/test', iCalUID: 'uid' }), { status: 200 }));
    await service.syncInterview('tenant', 'id', 'UPSERT');
    const [url, options] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('team%40example.com/events?conferenceDataVersion=1&sendUpdates=all');
    const body = JSON.parse(options!.body as string);
    expect(body.id).toBe('123e4567e89b12d3a456426614174000');
    expect(body.attendees).toHaveLength(3);
    expect(body.conferenceData.createRequest.requestId).toContain('123e4567');
  });
  it('recovers an event after a timeout without a second POST or invitation', async () => {
    const { service } = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'event', hangoutLink: 'https://meet.google.com/test' }), { status: 200 }));
    await service.syncInterview('tenant', 'id', 'UPSERT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });
  it('persists a failure instead of reporting a pending Meet as sent', async () => {
    const { service, prisma } = setup();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'event' }), { status: 200 }));
    await expect(service.syncInterview('tenant', 'id', 'UPSERT')).rejects.toThrow('todavía');
    expect(prisma.applicationInterview.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invitationStatus: 'FAILED', calendarSyncStatus: 'FAILED' }) }));
  });
  it('cancels the deterministic event even if the original response was lost', async () => {
    const { service } = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await service.syncInterview('tenant', 'id', 'CANCEL');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[0][0])).toContain('123e4567e89b12d3a456426614174000?sendUpdates=all');
  });
});
