// Emails the patient when an appointment changes status (EML-2). Called from the server
// actions after the change has committed, never from inside a transaction.
//
// It never throws: a failed email is logged and the booking stands. It works out what to
// say from the appointment as it is now, so callers only pass the id.
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { appointmentEvents, appointments, patients, practitioners, users } from "./db/schema";
import { sendEmail } from "./email";
import { appointmentEmail, type AppointmentEmailKind } from "./email-templates";
import { logger } from "./logger";

const log = logger.child({ module: "appointment-emails" });

/** Where the email's link points. BETTER_AUTH_URL is already the site's address in each environment. */
export function appointmentLink(appointmentId: string) {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/appointments/${appointmentId}`;
}

/** Error text can echo an address back (SMTP does), so strip anything email-shaped before logging. */
export const scrub = (s: string) => s.replace(/\S+@\S+/g, "[email]");
export async function notifyAppointment(appointmentId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        appointment: appointments,
        practitionerName: practitioners.name,
        timeZone: practitioners.timeZone,
        patientName: patients.name,
        patientEmail: users.email,
      })
      .from(appointments)
      .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .leftJoin(users, eq(users.id, patients.userId))
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    if (!row) return;

    // Patients the front desk created have no account, so there's no address to write to.
    if (!row.patientEmail) {
      log.info({ appointmentId }, "no account email for this patient, skipping");
      return;
    }

    const a = row.appointment;

    // If this appointment replaces an earlier one, find out whether the move went through
    // (the old one got a "rescheduled" event) and when the old time was.
    let previousStartsAt: Date | null = null;
    let replaced = false;
    if (a.rescheduledFromId) {
      const [old] = await db
        .select({ startsAt: appointments.startsAt })
        .from(appointments)
        .where(eq(appointments.id, a.rescheduledFromId))
        .limit(1);
      previousStartsAt = old?.startsAt ?? null;
      const [moved] = await db
        .select({ id: appointmentEvents.id })
        .from(appointmentEvents)
        .where(and(eq(appointmentEvents.appointmentId, a.rescheduledFromId), eq(appointmentEvents.type, "rescheduled")))
        .limit(1);
      replaced = Boolean(moved);
    }

    let kind: AppointmentEmailKind;
    switch (a.status) {
      case "pending": kind = "pending"; break;
      case "confirmed": kind = replaced ? "rescheduled" : "confirmed"; break;
      case "declined": kind = "declined"; break;
      case "cancelled": kind = "cancelled"; break;
      default: return; // completed: nothing to tell the patient
    }

    const email = appointmentEmail({
      kind,
      patientFirstName: row.patientName.trim().split(/\s+/)[0] ?? "",
      practitionerName: row.practitionerName,
      startsAt: a.startsAt,
      timeZone: row.timeZone,
      url: appointmentLink(a.id),
      // Only the kinds that talk about a move use the old time.
      previousStartsAt: kind === "pending" || kind === "declined" || kind === "rescheduled" ? previousStartsAt : null,
      cancelledBy: a.cancelledBy === "patient" ? "patient" : a.cancelledBy ? "practitioner" : null,
    });

    await sendEmail({ to: row.patientEmail, ...email });
  } catch (err) {
    log.error(
      { appointmentId, error: scrub(err instanceof Error ? err.message : String(err)) },
      "appointment email failed",
    );
  }
}