import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CalendarConnectionStatus,
  CalendarProvider,
  CalendarSyncStatus,
  InterviewStatus,
  Prisma,
  VideoConferenceProvider,
} from "@prisma/client";
import { AccessScope } from "../common/enums/access-scope.enum";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  AvailabilityQueryDto,
  CalendarOAuthDto,
  UpdateAvailabilityDto,
} from "./dto/recruitment.dto";
import { CalendarTokenCryptoService } from "./calendar-token-crypto.service";

type OAuthState = {
  tenantId: string;
  userId: string;
  provider: CalendarProvider;
  redirectUri: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

@Injectable()
export class InterviewCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CalendarTokenCryptoService,
  ) {}

  getAuthorizationUrl(
    tenantId: string,
    actor: JwtPayload,
    provider: CalendarProvider,
    redirectUri: string,
  ) {
    const config = this.providerConfig(provider);
    const state = this.crypto.signState({
      tenantId,
      userId: actor.sub,
      provider,
      redirectUri,
      expiresAt: Date.now() + 10 * 60_000,
    });
    const url = new URL(config.authorizationUrl);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("state", state);
    if (provider === CalendarProvider.GOOGLE) {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
    }
    return { provider, authorizationUrl: url.toString(), state };
  }

  async exchangeAuthorizationCode(
    tenantId: string,
    actor: JwtPayload,
    provider: CalendarProvider,
    dto: CalendarOAuthDto,
  ) {
    this.verifyOAuthState(
      dto.state,
      tenantId,
      actor.sub,
      provider,
      dto.redirectUri,
    );
    const config = this.providerConfig(provider);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: dto.code,
      redirect_uri: dto.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const token = await this.fetchJson<TokenResponse>(config.tokenUrl, {
      method: "POST",
      headers: this.oauthHeaders(provider),
      body,
    });
    if (!token.access_token) {
      throw new BadGatewayException(
        "Calendar provider did not return an access token",
      );
    }
    const profile = await this.fetchProfile(provider, token.access_token);
    const connection = await this.prisma.atsCalendarConnection.upsert({
      where: {
        tenantId_userId_provider: { tenantId, userId: actor.sub, provider },
      },
      create: {
        tenantId,
        userId: actor.sub,
        provider,
        externalAccountId: profile.id,
        externalEmail: profile.email,
        accessTokenEncrypted: this.crypto.encrypt(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? this.crypto.encrypt(token.refresh_token)
          : null,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        scopes: token.scope?.split(/[\s,]+/).filter(Boolean) ?? config.scopes,
      },
      update: {
        status: CalendarConnectionStatus.ACTIVE,
        externalAccountId: profile.id,
        externalEmail: profile.email,
        accessTokenEncrypted: this.crypto.encrypt(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? this.crypto.encrypt(token.refresh_token)
          : undefined,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        scopes: token.scope?.split(/[\s,]+/).filter(Boolean) ?? config.scopes,
        lastError: null,
      },
    });
    return this.safeConnection(connection);
  }

  listConnections(tenantId: string, actor: JwtPayload) {
    return this.prisma.atsCalendarConnection.findMany({
      where: { tenantId, userId: actor.sub },
      select: {
        id: true,
        provider: true,
        status: true,
        externalEmail: true,
        scopes: true,
        tokenExpiresAt: true,
        lastSyncedAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { provider: "asc" },
    });
  }

  async certifyConnections(tenantId?: string) {
    const connections = await this.prisma.atsCalendarConnection.findMany({
      where: {
        tenantId,
        status: CalendarConnectionStatus.ACTIVE,
        provider: { in: [CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT] },
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        provider: true,
        externalEmail: true,
        tokenExpiresAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const results: Array<Record<string, unknown>> = [];
    for (const connection of connections) {
      const startedAt = Date.now();
      try {
        const token = await this.accessToken(
          connection.tenantId,
          connection.userId,
          connection.provider,
        );
        const profile = await this.fetchProfile(connection.provider, token);
        await this.prisma.atsCalendarConnection.update({
          where: { id: connection.id },
          data: { lastSyncedAt: new Date(), lastError: null },
        });
        results.push({
          tenantId: connection.tenantId,
          provider: connection.provider,
          accountDomain: this.emailDomain(profile.email ?? connection.externalEmail),
          status: "PASS",
          tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = this.safeError(error);
        await this.prisma.atsCalendarConnection.update({
          where: { id: connection.id },
          data: { lastError: message },
        }).catch(() => undefined);
        results.push({
          tenantId: connection.tenantId,
          provider: connection.provider,
          accountDomain: this.emailDomain(connection.externalEmail),
          status: "FAIL",
          error: message,
          durationMs: Date.now() - startedAt,
        });
      }
    }
    return {
      activeConnections: connections.length,
      passed: results.filter((item) => item.status === "PASS").length,
      failed: results.filter((item) => item.status === "FAIL").length,
      truncated: connections.length === 100,
      results,
    };
  }

  async disconnect(
    tenantId: string,
    actor: JwtPayload,
    provider: CalendarProvider,
  ) {
    const result = await this.prisma.atsCalendarConnection.updateMany({
      where: { tenantId, userId: actor.sub, provider },
      data: {
        status: CalendarConnectionStatus.REVOKED,
        accessTokenEncrypted: this.crypto.encrypt("revoked"),
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
      },
    });
    if (!result.count)
      throw new NotFoundException("Calendar connection not found");
    return { disconnected: true };
  }

  async assertNoConflict(
    tenantId: string,
    interviewerUserId: string,
    startsAt: Date,
    endsAt: Date,
    excludeInterviewId?: string,
  ) {
    const conflict = await this.prisma.applicationInterview.findFirst({
      where: {
        tenantId,
        OR: [
          { interviewerUserId },
          { participants: { some: { userId: interviewerUserId, status: { notIn: ["DECLINED", "SUBSTITUTED"] } } } },
        ],
        id: excludeInterviewId ? { not: excludeInterviewId } : undefined,
        status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.CONFIRMED] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true },
    });
    if (conflict) {
      throw new ConflictException({
        message: "Interviewer has a conflicting interview",
        conflict,
      });
    }
    const external = await this.externalBusy(
      tenantId,
      interviewerUserId,
      startsAt,
      endsAt,
    );
    if (external.some((item) => item.start < endsAt && item.end > startsAt)) {
      throw new ConflictException(
        "Interviewer calendar is busy during this time",
      );
    }
  }

  async getAvailability(
    tenantId: string,
    actor: JwtPayload,
    interviewerUserId: string,
    query: AvailabilityQueryDto,
  ) {
    await this.assertUserAccess(tenantId, actor, interviewerUserId);
    return this.calculateAvailability(tenantId, interviewerUserId, query);
  }

  async getCommonAvailability(
    tenantId: string,
    interviewerUserIds: string[],
    query: AvailabilityQueryDto,
  ) {
    const uniqueIds = [...new Set(interviewerUserIds)];
    if (!uniqueIds.length) throw new BadRequestException("At least one interviewer is required");
    const calendars = await Promise.all(uniqueIds.map((userId) => this.calculateAvailability(tenantId, userId, query)));
    const common = calendars[0].slots.filter((slot) => calendars.every((calendar) => calendar.slots.some((candidate) => candidate.startsAt === slot.startsAt && candidate.endsAt === slot.endsAt)));
    return { interviewerUserIds: uniqueIds, timezone: calendars[0].timezone, slots: common, calendars };
  }

  private async calculateAvailability(
    tenantId: string,
    interviewerUserId: string,
    query: AvailabilityQueryDto,
  ) {
    const startsAt = this.parseDate(query.startsAt, "startsAt");
    const endsAt = this.parseDate(query.endsAt, "endsAt");
    if (endsAt <= startsAt)
      throw new BadRequestException("endsAt must be after startsAt");
    if (endsAt.getTime() - startsAt.getTime() > 31 * 24 * 60 * 60_000) {
      throw new BadRequestException("Availability range cannot exceed 31 days");
    }
    const settings = await this.prisma.interviewerAvailability.findUnique({
      where: { userId: interviewerUserId },
    });
    const busy = [
      ...(await this.localBusy(tenantId, interviewerUserId, startsAt, endsAt)),
      ...(await this.externalBusy(
        tenantId,
        interviewerUserId,
        startsAt,
        endsAt,
      )),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    const durationMinutes = query.durationMinutes ?? 60;
    const timezone = settings?.timezone ?? "UTC";
    const schedule = this.normalizeSchedule(settings?.weeklySchedule);
    const bufferMinutes = settings?.bufferMinutes ?? 15;
    const minStart = new Date(
      Math.max(
        startsAt.getTime(),
        Date.now() + (settings?.minNoticeHours ?? 2) * 60 * 60_000,
      ),
    );
    const slots: Array<{ startsAt: string; endsAt: string }> = [];
    for (
      let cursor = new Date(Math.ceil(minStart.getTime() / 900_000) * 900_000);
      cursor.getTime() + durationMinutes * 60_000 <= endsAt.getTime();
      cursor = new Date(cursor.getTime() + 900_000)
    ) {
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
      if (!this.isInsideWorkingHours(cursor, slotEnd, timezone, schedule))
        continue;
      const paddedStart = new Date(cursor.getTime() - bufferMinutes * 60_000);
      const paddedEnd = new Date(slotEnd.getTime() + bufferMinutes * 60_000);
      if (busy.some((item) => item.start < paddedEnd && item.end > paddedStart))
        continue;
      slots.push({
        startsAt: cursor.toISOString(),
        endsAt: slotEnd.toISOString(),
      });
    }
    return {
      interviewerUserId,
      timezone,
      busy: busy.map((item) => ({
        startsAt: item.start.toISOString(),
        endsAt: item.end.toISOString(),
        source: item.source,
      })),
      slots: slots.slice(0, 200),
    };
  }

  getAvailabilitySettings(tenantId: string, actor: JwtPayload) {
    return this.prisma.interviewerAvailability.findFirst({
      where: { tenantId, userId: actor.sub },
    });
  }

  async updateAvailabilitySettings(
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateAvailabilityDto,
  ) {
    this.assertTimezone(dto.timezone);
    const weeklySchedule = this.validateSchedule(dto.weeklySchedule);
    return this.prisma.interviewerAvailability.upsert({
      where: { userId: actor.sub },
      create: {
        tenantId,
        userId: actor.sub,
        timezone: dto.timezone,
        weeklySchedule,
        bufferMinutes: dto.bufferMinutes,
        minNoticeHours: dto.minNoticeHours,
      },
      update: {
        timezone: dto.timezone,
        weeklySchedule,
        bufferMinutes: dto.bufferMinutes,
        minNoticeHours: dto.minNoticeHours,
      },
    });
  }

  async syncInterview(
    tenantId: string,
    interviewId: string,
    action: "UPSERT" | "CANCEL",
  ) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: { id: interviewId, tenantId },
      include: {
        interviewer: { select: { id: true, email: true } },
      },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    try {
      let meetingUrl = interview.meetingUrl;
      let externalMeetingId = interview.externalMeetingId;
      if (interview.videoProvider === VideoConferenceProvider.ZOOM) {
        const zoom = await this.syncZoomMeeting(interview, action);
        meetingUrl = zoom?.meetingUrl ?? meetingUrl;
        externalMeetingId = zoom?.meetingId ?? externalMeetingId;
      }
      let event: { eventId?: string; meetingUrl?: string; iCalUid?: string } =
        {};
      if (interview.calendarProvider === CalendarProvider.GOOGLE) {
        event = await this.syncGoogleEvent(interview, action, meetingUrl);
      } else if (interview.calendarProvider === CalendarProvider.MICROSOFT) {
        event = await this.syncMicrosoftEvent(interview, action, meetingUrl);
      }
      const connected = Boolean(
        interview.calendarProvider ||
        interview.videoProvider === VideoConferenceProvider.ZOOM,
      );
      return this.prisma.applicationInterview.update({
        where: { id: interview.id },
        data: {
          meetingUrl: event.meetingUrl ?? meetingUrl,
          externalEventId: event.eventId ?? interview.externalEventId,
          externalMeetingId,
          externalICalUid: event.iCalUid ?? interview.externalICalUid,
          calendarSyncStatus:
            action === "CANCEL"
              ? CalendarSyncStatus.CANCELLED
              : connected
                ? CalendarSyncStatus.SYNCED
                : CalendarSyncStatus.NOT_CONNECTED,
          calendarSyncError: null,
          calendarSyncedAt: connected ? new Date() : null,
          icsSequence:
            action === "UPSERT" ? { increment: 1 } : interview.icsSequence,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "Calendar synchronization failed";
      await this.prisma.applicationInterview.update({
        where: { id: interview.id },
        data: {
          calendarSyncStatus: CalendarSyncStatus.FAILED,
          calendarSyncError: message,
        },
      });
      throw error;
    }
  }

  async retrySync(tenantId: string, actor: JwtPayload, interviewId: string) {
    await this.assertInterviewAccess(tenantId, actor, interviewId);
    return this.syncInterview(tenantId, interviewId, "UPSERT");
  }

  async generateIcs(tenantId: string, actor: JwtPayload, interviewId: string) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: {
        id: interviewId,
        tenantId,
        ...(actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
          ? {}
          : {
              application: {
                vacancy: { branchId: { in: actor.allowedBranchIds } },
              },
            }),
      },
      include: {
        interviewer: {
          select: { email: true, firstName: true, lastName: true },
        },
        application: { include: { candidate: true, vacancy: true } },
      },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    const uid = interview.externalICalUid ?? `${interview.id}@talentos`;
    const cancelled = interview.status === InterviewStatus.CANCELED;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TalentOS//ATS Interviews//ES",
      `METHOD:${cancelled ? "CANCEL" : "REQUEST"}`,
      "BEGIN:VEVENT",
      `UID:${this.icsEscape(uid)}`,
      `SEQUENCE:${interview.icsSequence}`,
      `DTSTAMP:${this.icsDate(new Date())}`,
      `DTSTART:${this.icsDate(interview.startsAt)}`,
      `DTEND:${this.icsDate(interview.endsAt)}`,
      `SUMMARY:${this.icsEscape(interview.title)}`,
      `DESCRIPTION:${this.icsEscape(`Entrevista para ${interview.application.vacancy.title}`)}`,
      `LOCATION:${this.icsEscape(interview.meetingUrl || interview.location || "")}`,
      `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
      `ORGANIZER;CN=${this.icsEscape(`${interview.interviewer.firstName} ${interview.interviewer.lastName}`)}:MAILTO:${interview.interviewer.email}`,
      `ATTENDEE;CN=${this.icsEscape(interview.application.candidate.fullName)};RSVP=TRUE:MAILTO:${interview.application.candidate.email}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return {
      filename: `entrevista-${interview.id}.ics`,
      content: `${lines.join("\r\n")}\r\n`,
    };
  }

  private async syncGoogleEvent(
    interview: any,
    action: "UPSERT" | "CANCEL",
    meetingUrl?: string | null,
  ) {
    const token = await this.accessToken(
      interview.tenantId,
      interview.interviewerUserId,
      CalendarProvider.GOOGLE,
    );
    const base =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    if (action === "CANCEL") {
      if (interview.externalEventId) {
        await this.fetchOk(
          `${base}/${encodeURIComponent(interview.externalEventId)}?sendUpdates=none`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` },
          },
          [204, 404, 410],
        );
      }
      return {};
    }
    const body: Record<string, unknown> = {
      summary: "Entrevista TalentOS",
      description: meetingUrl ? `Reunión ATS\n${meetingUrl}` : "Reunión ATS",
      start: {
        dateTime: interview.startsAt.toISOString(),
        timeZone: interview.timezone,
      },
      end: {
        dateTime: interview.endsAt.toISOString(),
        timeZone: interview.timezone,
      },
    };
    if (interview.videoProvider === VideoConferenceProvider.GOOGLE_MEET) {
      body.conferenceData = {
        createRequest: {
          requestId: `talentos-${interview.id}-${interview.icsSequence + 1}`,
        },
      };
    }
    const endpoint = interview.externalEventId
      ? `${base}/${encodeURIComponent(interview.externalEventId)}?conferenceDataVersion=1&sendUpdates=none`
      : `${base}?conferenceDataVersion=1&sendUpdates=none`;
    const response = await this.fetchJson<any>(endpoint, {
      method: interview.externalEventId ? "PATCH" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return {
      eventId: response.id,
      iCalUid: response.iCalUID,
      meetingUrl: response.hangoutLink ?? meetingUrl,
    };
  }

  private async syncMicrosoftEvent(
    interview: any,
    action: "UPSERT" | "CANCEL",
    meetingUrl?: string | null,
  ) {
    const token = await this.accessToken(
      interview.tenantId,
      interview.interviewerUserId,
      CalendarProvider.MICROSOFT,
    );
    const base = "https://graph.microsoft.com/v1.0/me/events";
    if (action === "CANCEL") {
      if (interview.externalEventId) {
        await this.fetchOk(
          `${base}/${encodeURIComponent(interview.externalEventId)}`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` },
          },
          [204, 404],
        );
      }
      return {};
    }
    const body = {
      subject: "Entrevista TalentOS",
      body: {
        contentType: "Text",
        content: meetingUrl ? `Reunión ATS\n${meetingUrl}` : "Reunión ATS",
      },
      start: {
        dateTime: interview.startsAt.toISOString().replace(/Z$/, ""),
        timeZone: "UTC",
      },
      end: {
        dateTime: interview.endsAt.toISOString().replace(/Z$/, ""),
        timeZone: "UTC",
      },
      isOnlineMeeting:
        interview.videoProvider === VideoConferenceProvider.MICROSOFT_TEAMS,
      onlineMeetingProvider:
        interview.videoProvider === VideoConferenceProvider.MICROSOFT_TEAMS
          ? "teamsForBusiness"
          : undefined,
    };
    const endpoint = interview.externalEventId
      ? `${base}/${encodeURIComponent(interview.externalEventId)}`
      : base;
    const response = await this.fetchJson<any>(endpoint, {
      method: interview.externalEventId ? "PATCH" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return {
      eventId: response.id ?? interview.externalEventId,
      iCalUid: response.iCalUId,
      meetingUrl: response.onlineMeeting?.joinUrl ?? meetingUrl,
    };
  }

  private async syncZoomMeeting(interview: any, action: "UPSERT" | "CANCEL") {
    const token = await this.accessToken(
      interview.tenantId,
      interview.interviewerUserId,
      CalendarProvider.ZOOM,
    );
    if (action === "CANCEL") {
      if (interview.externalMeetingId) {
        await this.fetchOk(
          `https://api.zoom.us/v2/meetings/${encodeURIComponent(interview.externalMeetingId)}`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` },
          },
          [204, 404],
        );
      }
      return null;
    }
    const endpoint = interview.externalMeetingId
      ? `https://api.zoom.us/v2/meetings/${encodeURIComponent(interview.externalMeetingId)}`
      : "https://api.zoom.us/v2/users/me/meetings";
    const response = await this.fetchJson<any>(endpoint, {
      method: interview.externalMeetingId ? "PATCH" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        topic: "Entrevista TalentOS",
        type: 2,
        start_time: interview.startsAt.toISOString(),
        duration: Math.max(
          1,
          Math.ceil(
            (interview.endsAt.getTime() - interview.startsAt.getTime()) /
              60_000,
          ),
        ),
        timezone: interview.timezone,
        settings: { waiting_room: true, join_before_host: false },
      }),
    });
    return {
      meetingId: String(response.id ?? interview.externalMeetingId),
      meetingUrl: response.join_url ?? interview.meetingUrl,
    };
  }

  private async externalBusy(
    tenantId: string,
    userId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const connections = await this.prisma.atsCalendarConnection.findMany({
      where: {
        tenantId,
        userId,
        provider: {
          in: [CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT],
        },
        status: CalendarConnectionStatus.ACTIVE,
      },
    });
    const busy: Array<{ start: Date; end: Date; source: string }> = [];
    for (const connection of connections) {
      try {
        const token = await this.accessToken(
          tenantId,
          userId,
          connection.provider,
        );
        if (connection.provider === CalendarProvider.GOOGLE) {
          const response = await this.fetchJson<any>(
            "https://www.googleapis.com/calendar/v3/freeBusy",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                timeMin: startsAt.toISOString(),
                timeMax: endsAt.toISOString(),
                items: [{ id: "primary" }],
              }),
            },
          );
          for (const item of response.calendars?.primary?.busy ?? []) {
            busy.push({
              start: new Date(item.start),
              end: new Date(item.end),
              source: "GOOGLE",
            });
          }
        } else if (connection.externalEmail) {
          const response = await this.fetchJson<any>(
            "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                schedules: [connection.externalEmail],
                startTime: {
                  dateTime: startsAt.toISOString().replace(/Z$/, ""),
                  timeZone: "UTC",
                },
                endTime: {
                  dateTime: endsAt.toISOString().replace(/Z$/, ""),
                  timeZone: "UTC",
                },
                availabilityViewInterval: 15,
              }),
            },
          );
          for (const item of response.value?.[0]?.scheduleItems ?? []) {
            busy.push({
              start: new Date(`${item.start.dateTime}Z`),
              end: new Date(`${item.end.dateTime}Z`),
              source: "MICROSOFT",
            });
          }
        }
      } catch {
        // Local conflict detection remains active during provider outages.
      }
    }
    return busy;
  }

  private localBusy(
    tenantId: string,
    userId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    return this.prisma.applicationInterview
      .findMany({
        where: {
          tenantId,
          OR: [
            { interviewerUserId: userId },
            { participants: { some: { userId, status: { notIn: ["DECLINED", "SUBSTITUTED"] } } } },
          ],
          status: {
            in: [InterviewStatus.SCHEDULED, InterviewStatus.CONFIRMED],
          },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { startsAt: true, endsAt: true },
      })
      .then((items) =>
        items.map((item) => ({
          start: item.startsAt,
          end: item.endsAt,
          source: "ATS",
        })),
      );
  }

  private async accessToken(
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
  ) {
    const connection = await this.prisma.atsCalendarConnection.findUnique({
      where: { tenantId_userId_provider: { tenantId, userId, provider } },
    });
    if (!connection || connection.status !== CalendarConnectionStatus.ACTIVE) {
      throw new BadRequestException(
        `${provider} calendar is not connected for the interviewer`,
      );
    }
    if (
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() > Date.now() + 60_000
    ) {
      return this.crypto.decrypt(connection.accessTokenEncrypted);
    }
    if (!connection.refreshTokenEncrypted) {
      await this.prisma.atsCalendarConnection.update({
        where: { id: connection.id },
        data: {
          status: CalendarConnectionStatus.EXPIRED,
          lastError: "Refresh token unavailable",
        },
      });
      throw new BadRequestException(`${provider} calendar connection expired`);
    }
    const config = this.providerConfig(provider);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.crypto.decrypt(connection.refreshTokenEncrypted),
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const token = await this.fetchJson<TokenResponse>(config.tokenUrl, {
      method: "POST",
      headers: this.oauthHeaders(provider),
      body,
    });
    await this.prisma.atsCalendarConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? this.crypto.encrypt(token.refresh_token)
          : undefined,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        lastError: null,
      },
    });
    return token.access_token;
  }

  private providerConfig(provider: CalendarProvider) {
    if (provider === CalendarProvider.GOOGLE) {
      return {
        clientId: this.requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
        clientSecret: this.requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "openid",
          "email",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ],
      };
    }
    if (provider === CalendarProvider.MICROSOFT) {
      const authority =
        process.env.MICROSOFT_CALENDAR_TENANT_ID?.trim() || "common";
      return {
        clientId: this.requiredEnv("MICROSOFT_CALENDAR_CLIENT_ID"),
        clientSecret: this.requiredEnv("MICROSOFT_CALENDAR_CLIENT_SECRET"),
        authorizationUrl: `https://login.microsoftonline.com/${authority}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${authority}/oauth2/v2.0/token`,
        scopes: [
          "openid",
          "email",
          "offline_access",
          "User.Read",
          "Calendars.ReadWrite",
        ],
      };
    }
    return {
      clientId: this.requiredEnv("ZOOM_CLIENT_ID"),
      clientSecret: this.requiredEnv("ZOOM_CLIENT_SECRET"),
      authorizationUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes: [
        "meeting:write:meeting",
        "meeting:update:meeting",
        "meeting:delete:meeting",
        "user:read:user",
      ],
    };
  }

  private oauthHeaders(provider: CalendarProvider): Record<string, string> {
    if (provider !== CalendarProvider.ZOOM) {
      return { "content-type": "application/x-www-form-urlencoded" };
    }
    const config = this.providerConfig(provider);
    return {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    };
  }

  private async fetchProfile(provider: CalendarProvider, token: string) {
    if (provider === CalendarProvider.GOOGLE) {
      const profile = await this.fetchJson<any>(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { authorization: `Bearer ${token}` } },
      );
      return { id: profile.sub, email: profile.email };
    }
    if (provider === CalendarProvider.MICROSOFT) {
      const profile = await this.fetchJson<any>(
        "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
        { headers: { authorization: `Bearer ${token}` } },
      );
      return {
        id: profile.id,
        email: profile.mail ?? profile.userPrincipalName,
      };
    }
    const profile = await this.fetchJson<any>(
      "https://api.zoom.us/v2/users/me",
      { headers: { authorization: `Bearer ${token}` } },
    );
    return { id: String(profile.id), email: profile.email };
  }

  private emailDomain(email?: string | null) {
    return email?.includes("@") ? email.split("@").pop()?.toLowerCase() ?? null : null;
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : "Calendar certification failed";
    return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new BadGatewayException(
          `Calendar provider returned HTTP ${response.status}: ${detail}`,
        );
      }
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchOk(url: string, init: RequestInit, accepted: number[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
      if (!accepted.includes(response.status)) {
        throw new BadGatewayException(
          `Calendar provider returned HTTP ${response.status}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private verifyOAuthState(
    state: string,
    tenantId: string,
    userId: string,
    provider: CalendarProvider,
    redirectUri: string,
  ) {
    let payload: OAuthState;
    try {
      payload = this.crypto.verifyState<OAuthState>(state);
    } catch {
      throw new BadRequestException("Invalid OAuth state");
    }
    if (
      payload.expiresAt < Date.now() ||
      payload.tenantId !== tenantId ||
      payload.userId !== userId ||
      payload.provider !== provider ||
      payload.redirectUri !== redirectUri
    ) {
      throw new BadRequestException(
        "OAuth state expired or does not match the current session",
      );
    }
  }

  private safeConnection(connection: any) {
    const safe = { ...connection };
    delete safe.accessTokenEncrypted;
    delete safe.refreshTokenEncrypted;
    return safe;
  }

  private async assertUserAccess(
    tenantId: string,
    actor: JwtPayload,
    userId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        ...(actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
          ? {}
          : {
              branchAccesses: {
                some: { branchId: { in: actor.allowedBranchIds } },
              },
            }),
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("Interviewer not found");
  }

  private async assertInterviewAccess(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
  ) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: {
        id: interviewId,
        tenantId,
        ...(actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
          ? {}
          : {
              application: {
                vacancy: { branchId: { in: actor.allowedBranchIds } },
              },
            }),
      },
      select: { id: true },
    });
    if (!interview) throw new NotFoundException("Interview not found");
  }

  private validateSchedule(
    value: Record<string, Array<{ start: string; end: string }>>,
  ) {
    const allowedDays = new Set(["0", "1", "2", "3", "4", "5", "6"]);
    for (const [day, ranges] of Object.entries(value)) {
      if (
        !allowedDays.has(day) ||
        !Array.isArray(ranges) ||
        ranges.length > 8
      ) {
        throw new BadRequestException("Invalid weekly availability schedule");
      }
      for (const range of ranges) {
        if (
          !this.validTime(range.start) ||
          !this.validTime(range.end) ||
          range.start >= range.end
        ) {
          throw new BadRequestException(
            "Availability ranges must use HH:mm and end after start",
          );
        }
      }
    }
    return value as Prisma.InputJsonValue;
  }

  private normalizeSchedule(value: Prisma.JsonValue | undefined) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        "1": [{ start: "09:00", end: "17:00" }],
        "2": [{ start: "09:00", end: "17:00" }],
        "3": [{ start: "09:00", end: "17:00" }],
        "4": [{ start: "09:00", end: "17:00" }],
        "5": [{ start: "09:00", end: "17:00" }],
      };
    }
    return value as Record<string, Array<{ start: string; end: string }>>;
  }

  private isInsideWorkingHours(
    startsAt: Date,
    endsAt: Date,
    timezone: string,
    schedule: Record<string, Array<{ start: string; end: string }>>,
  ) {
    const start = this.zonedParts(startsAt, timezone);
    const end = this.zonedParts(endsAt, timezone);
    if (start.date !== end.date) return false;
    return (schedule[start.day] ?? []).some(
      (range) => start.time >= range.start && end.time <= range.end,
    );
  }

  private zonedParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const map = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const dayMap: Record<string, string> = {
      Sun: "0",
      Mon: "1",
      Tue: "2",
      Wed: "3",
      Thu: "4",
      Fri: "5",
      Sat: "6",
    };
    return {
      day: dayMap[map.weekday],
      date: `${map.year}-${map.month}-${map.day}`,
      time: `${map.hour}:${map.minute}`,
    };
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException("Invalid IANA timezone");
    }
  }

  private validTime(value: string) {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date`);
    }
    return date;
  }

  private requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new BadRequestException(`${name} is not configured`);
    return value;
  }

  private icsDate(value: Date) {
    return value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  }

  private icsEscape(value: string) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }
}
