import { ConflictException } from "@nestjs/common";
import { AccessScope } from "../common/enums/access-scope.enum";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { CalendarTokenCryptoService } from "./calendar-token-crypto.service";
import { InterviewCalendarService } from "./interview-calendar.service";

describe("Interview calendar integration", () => {
  const actor = {
    sub: "user-1",
    tenantId: "tenant-1",
    role: "RECRUITER",
    roles: ["RECRUITER"],
    scope: AccessScope.TENANT,
    allowedBranchIds: ["branch-1"],
    isSuperAdmin: false,
  } as JwtPayload;

  it("encrypts calendar tokens and rejects a modified OAuth state", () => {
    const crypto = new CalendarTokenCryptoService();
    const encrypted = crypto.encrypt("secret-token");
    expect(encrypted).not.toContain("secret-token");
    expect(crypto.decrypt(encrypted)).toBe("secret-token");

    const state = crypto.signState({ tenantId: "tenant-1" });
    expect(crypto.verifyState(state)).toEqual({ tenantId: "tenant-1" });
    expect(() => crypto.verifyState(`${state}modified`)).toThrow();
  });

  it("reports provider readiness without exposing OAuth credentials", () => {
    const previousGoogleId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const previousGoogleSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "google-client";
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const service = new InterviewCalendarService({} as never, new CalendarTokenCryptoService());

    const providers = service.listProviderConfiguration();

    expect(providers.find((item) => item.provider === "GOOGLE")).toEqual({ provider: "GOOGLE", configured: false });
    expect(providers.every((item) => !("clientId" in item) && !("clientSecret" in item))).toBe(true);
    if (previousGoogleId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = previousGoogleId;
    if (previousGoogleSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previousGoogleSecret;
  });

  it("blocks a local scheduling conflict before contacting external providers", async () => {
    const prisma = {
      applicationInterview: {
        findFirst: jest.fn().mockResolvedValue({
          id: "interview-existing",
          title: "Existing interview",
          startsAt: new Date("2026-08-03T14:00:00.000Z"),
          endsAt: new Date("2026-08-03T15:00:00.000Z"),
        }),
      },
      atsCalendarConnection: { findMany: jest.fn() },
    };
    const service = new InterviewCalendarService(
      prisma as never,
      new CalendarTokenCryptoService(),
    );

    await expect(
      service.assertNoConflict(
        "tenant-1",
        actor.sub,
        new Date("2026-08-03T14:30:00.000Z"),
        new Date("2026-08-03T15:30:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.atsCalendarConnection.findMany).not.toHaveBeenCalled();
  });

  it("returns working-hour slots excluding ATS busy ranges", async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: actor.sub }) },
      interviewerAvailability: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: "UTC",
          weeklySchedule: {
            "1": [{ start: "09:00", end: "12:00" }],
          },
          bufferMinutes: 0,
          minNoticeHours: 0,
        }),
      },
      applicationInterview: {
        findMany: jest.fn().mockResolvedValue([
          {
            startsAt: new Date("2099-08-03T10:00:00.000Z"),
            endsAt: new Date("2099-08-03T11:00:00.000Z"),
          },
        ]),
      },
      atsCalendarConnection: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new InterviewCalendarService(
      prisma as never,
      new CalendarTokenCryptoService(),
    );

    const result = await service.getAvailability("tenant-1", actor, actor.sub, {
      startsAt: "2099-08-03T09:00:00.000Z",
      endsAt: "2099-08-03T12:00:00.000Z",
      durationMinutes: 60,
    });

    expect(result.busy).toEqual([expect.objectContaining({ source: "ATS" })]);
    expect(result.slots).not.toContainEqual({
      startsAt: "2099-08-03T10:00:00.000Z",
      endsAt: "2099-08-03T11:00:00.000Z",
    });
  });

  it("generates an internal ICS invitation for the authenticated candidate", async () => {
    const prisma = {
      applicationInterview: {
        findFirst: jest.fn().mockResolvedValue({
          id: "interview-1",
          externalICalUid: null,
          icsSequence: 2,
          status: "SCHEDULED",
          title: "Entrevista técnica",
          startsAt: new Date("2099-08-03T14:00:00.000Z"),
          endsAt: new Date("2099-08-03T15:00:00.000Z"),
          meetingUrl: "https://meet.example.com/manual-link",
          location: null,
          interviewer: { firstName: "Ana", lastName: "López", email: "ana@empresa.test" },
          application: { candidate: { fullName: "María Pérez", email: "maria@example.test" }, vacancy: { title: "Analista" } },
        }),
      },
    };
    const service = new InterviewCalendarService(prisma as never, new CalendarTokenCryptoService());

    const invitation = await service.generateCandidateIcs("tenant-1", "candidate-1", "interview-1");

    expect(prisma.applicationInterview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "interview-1", tenantId: "tenant-1", application: { candidateId: "candidate-1" } },
    }));
    expect(invitation.content).toContain("BEGIN:VCALENDAR");
    expect(invitation.content).toContain("LOCATION:https://meet.example.com/manual-link");
    expect(invitation.content).toContain("ATTENDEE;CN=María Pérez");
  });
});
