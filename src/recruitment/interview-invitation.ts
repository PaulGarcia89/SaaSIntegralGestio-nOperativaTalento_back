export type InterviewInvitationData = {
  id: string; title: string; status: string; startsAt: Date; endsAt: Date; icsSequence: number;
  externalICalUid?: string | null; meetingUrl?: string | null; location?: string | null; reminderMinutes?: number;
  interviewer: { email: string }; application: { candidate: { email: string; fullName?: string }; vacancy: { title: string } };
  participants?: { status?: string; user: { email: string } }[]; additionalAttendees?: string[];
};
const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r/g, "");
const date = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
// RFC 5545: fold at 75 octets without cutting a UTF-8 code point.
const fold = (line: string) => { let result = "", width = 0; for (const char of line) { const bytes = Buffer.byteLength(char); if (width + bytes > 75) { result += "\r\n "; width = 1; } result += char; width += bytes; } return result; };
export function buildInterviewInvitation(interview: InterviewInvitationData) {
  const method = interview.status === "CANCELED" ? "CANCEL" : "REQUEST";
  const emails = [...new Set([interview.application.candidate.email, interview.interviewer.email, ...(interview.participants ?? []).filter((p) => p.status !== "DECLINED").map((p) => p.user.email), ...(interview.additionalAttendees ?? [])].map((email) => email.trim().toLowerCase()))].filter((email) => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TalentOS//ATS Interviews//ES", "CALSCALE:GREGORIAN", `METHOD:${method}`, "BEGIN:VEVENT", `UID:${escape(interview.externalICalUid ?? `${interview.id}@talentos`)}`, `SEQUENCE:${interview.icsSequence}`, `DTSTAMP:${date(new Date())}`, `DTSTART:${date(interview.startsAt)}`, `DTEND:${date(interview.endsAt)}`, `SUMMARY:${escape(interview.title)}`, `DESCRIPTION:${escape(`Entrevista para ${interview.application.vacancy.title}${interview.meetingUrl ? `\n${interview.meetingUrl}` : ""}`)}`, `LOCATION:${escape(interview.meetingUrl || interview.location || "")}`, `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, `ORGANIZER:mailto:${interview.interviewer.email.replace(/[\r\n]/g, "")}`, ...emails.map((email) => { const name = email === interview.application.candidate.email.toLowerCase() ? interview.application.candidate.fullName : undefined; const cn = name ? `;CN=${name.replace(/[\r\n;:,"]/g, " ")}` : ""; return `ATTENDEE${cn};RSVP=TRUE:mailto:${email}`; }), ...(method === "REQUEST" && (interview.reminderMinutes ?? 0) > 0 ? ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Recordatorio de entrevista", `TRIGGER:-PT${interview.reminderMinutes}M`, "END:VALARM"] : []), "END:VEVENT", "END:VCALENDAR"];
  return { filename: `entrevista-${interview.id}.ics`, method, content: lines.map(fold).join("\r\n") + "\r\n" };
}
