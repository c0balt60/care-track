import { describe, expect, it } from "vitest";
import { formatWhen } from "./dates";
import { appointmentEmail, type AppointmentEmailData, type AppointmentEmailKind } from "./email-templates";

const base: AppointmentEmailData = {
  kind: "confirmed",
  patientFirstName: "Pat",
  practitionerName: "Dr. Lee",
  startsAt: new Date("2026-12-07T15:00:00Z"),
  timeZone: "America/Toronto",
  url: "https://care.example.com/appointments/abc",
};
const previous = new Date("2026-12-03T15:00:00Z");
// Built with formatWhen so the test doesn't depend on how this Node prints "10:00 AM".
const when = formatWhen(base.startsAt, base.timeZone);
const was = formatWhen(previous, base.timeZone);

const kinds: [AppointmentEmailKind, RegExp][] = [
  ["pending", /request received/i],
  ["confirmed", /confirmed/i],
  ["declined", /declined/i],
  ["cancelled", /cancelled/i],
  ["rescheduled", /rescheduled/i],
];

describe("appointmentEmail", () => {
  it.each(kinds)("%s: right subject, with who, when and the link in both versions", (kind, subject) => {
    const email = appointmentEmail({ ...base, kind });
    expect(email.subject).toMatch(subject);
    expect(email.subject).not.toMatch(/[\r\n]/);
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Dr. Lee");
      expect(body).toContain(when);
      expect(body).toContain("https://care.example.com/appointments/abc");
    }
  });

  it("explains a move request: the old time still stands until approval", () => {
    const text = appointmentEmail({ ...base, kind: "pending", previousStartsAt: previous }).text;
    expect(text).toContain(was);
    expect(text).toContain(when);
    expect(text).toMatch(/original appointment still stands/);
  });

  it("says the original appointment is unchanged when a move is declined", () => {
    const text = appointmentEmail({ ...base, kind: "declined", previousStartsAt: previous }).text;
    expect(text).toContain(was);
    expect(text).toMatch(/unchanged/);
  });

  it("shows the old and new time when rescheduled", () => {
    const text = appointmentEmail({ ...base, kind: "rescheduled", previousStartsAt: previous }).text;
    expect(text).toContain(was);
    expect(text).toContain(when);
  });

  it("says who cancelled, without saying why", () => {
    expect(appointmentEmail({ ...base, kind: "cancelled", cancelledBy: "patient" }).text).toMatch(/You cancelled/);
    expect(appointmentEmail({ ...base, kind: "cancelled", cancelledBy: "practitioner" }).text).toMatch(/cancelled by the clinic/);
    expect(appointmentEmail({ ...base, kind: "cancelled", cancelledBy: "staff" }).text).toMatch(/cancelled by the clinic/);
  });

  // The privacy rule. Hand the template a whole appointment row's worth of private
  // fields; none of them may come out, for any kind.
  it.each(kinds)("%s: never includes health-related details, even if they're passed in", (kind) => {
    const row = {
      ...base,
      kind,
      previousStartsAt: previous,
      cancelledBy: "practitioner",
      reason: "SECRET-REASON",
      cancelReason: "SECRET-CANCEL",
      declineNote: "SECRET-DECLINE",
      specialty: "SECRET-SPECIALTY",
      services: "SECRET-SERVICES",
      clinicName: "SECRET-CLINIC",
      notes: "SECRET-NOTES",
    } as AppointmentEmailData;
    expect(JSON.stringify(appointmentEmail(row))).not.toContain("SECRET");
  });

  it("escapes names in the HTML version", () => {
    const email = appointmentEmail({ ...base, practitionerName: "<script>alert(1)</script>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("falls back to a plain greeting when there's no first name", () => {
    expect(appointmentEmail({ ...base, patientFirstName: "  " }).text.startsWith("Hello,")).toBe(true);
  });
});