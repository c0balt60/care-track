// The appointment emails (EML-2). Pure: data in, { subject, text, html } out. No database
// and no sending, so it's easy to test.
//
// PRIVACY RULE: email isn't a private channel. A body may say that something happened and
// when, never why. Allowed: first name, practitioner name, date and time, a link.
// Never: the reason for the visit, a cancel reason, a decline note, the service, the
// specialty, or the clinic name (any of those can hint at a health condition).
// The link goes to the appointment page, which is behind the login.
import { formatWhen } from "./dates";

export type AppointmentEmailKind = "pending" | "confirmed" | "declined" | "cancelled" | "rescheduled";

export type AppointmentEmailData = {
  kind: AppointmentEmailKind;
  patientFirstName: string;
  practitionerName: string;
  startsAt: Date;
  /** The practitioner's time zone. Times always show in it (see lib/dates.ts). */
  timeZone: string;
  /** Link to /appointments/[id]. */
  url: string;
  /** When the appointment is a move: the time it replaces. Used by pending, declined and rescheduled. */
  previousStartsAt?: Date | null;
  /** Who cancelled. Only used by "cancelled". */
  cancelledBy?: "patient" | "practitioner" | "staff" | null;
};

export type EmailContent = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function content(d: AppointmentEmailData): { subject: string; lines: string[] } {
  const who = d.practitionerName;
  const when = formatWhen(d.startsAt, d.timeZone);
  const was = d.previousStartsAt ? formatWhen(d.previousStartsAt, d.timeZone) : null;

  switch (d.kind) {
    case "pending":
      return was
        ? {
            subject: "Request to move your appointment received",
            lines: [
              `You asked to move your appointment with ${who} from ${was} to ${when}.`,
              `${who} needs to approve the new time. Until then, your original appointment still stands.`,
            ],
          }
        : {
            subject: "Appointment request received",
            lines: [
              `We've received your request for an appointment with ${who} on ${when}.`,
              `${who} needs to confirm it. We'll email you when they do.`,
            ],
          };
    case "confirmed":
      return { subject: "Appointment confirmed", lines: [`Your appointment with ${who} is confirmed for ${when}.`] };
    case "declined":
      return was
        ? {
            subject: "Request to move your appointment declined",
            lines: [`${who} couldn't move your appointment to ${when}.`, `Your original appointment on ${was} is unchanged.`],
          }
        : {
            subject: "Appointment request declined",
            lines: [`${who} couldn't take your request for ${when}.`, "You're welcome to pick another time."],
          };
    case "cancelled":
      return {
        subject: "Appointment cancelled",
        lines: [
          d.cancelledBy === "patient"
            ? `You cancelled your appointment with ${who} on ${when}.`
            : `Your appointment with ${who} on ${when} was cancelled by the clinic.`,
        ],
      };
    case "rescheduled":
      return {
        subject: "Appointment rescheduled",
        lines: [
          was
            ? `Your appointment with ${who} has moved from ${was} to ${when}.`
            : `Your appointment with ${who} has been rescheduled to ${when}.`,
        ],
      };
  }
}

export function appointmentEmail(data: AppointmentEmailData): EmailContent {
  const { subject, lines } = content(data);
  const greeting = data.patientFirstName.trim() ? `Hi ${data.patientFirstName.trim()},` : "Hello,";

  const text = [
    greeting,
    ...lines,
    `Sign in to see the details or make changes: ${data.url}`,
    "Please don't reply to this email.",
  ].join("\n\n");

  const html =
    `<p>${esc(greeting)}</p>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join("") +
    `<p><a href="${esc(data.url)}">View your appointment</a></p>` +
    `<p style="color:#666">Please don't reply to this email.</p>`;

  return { subject, text, html };
}