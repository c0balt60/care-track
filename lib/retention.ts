// How long CareTrack keeps each kind of data, and the daily clean-up that enforces it (#78).
// The written policy, with the reasons, is in docs/compliance-checklist.md, section 5.
//
// Runs from the daily cron (app/api/cron/reminders/route.ts). Every step is a plain DELETE
// with a cut-off date, so running it twice, or late, is harmless.
import { and, inArray, lt, notExists, sql } from "drizzle-orm";
import { db } from "./db";
import { appointments, auditLog, payments, sessions, verifications } from "./db/schema";

export const RETENTION = {
  /** Appointment history, counted from when the appointment ended. HIPAA keeps records 6 years. */
  appointmentYears: 6,
  /**
   * Audit rows, counted from when they were written. The append-only trigger in
   * drizzle/0012_account_deletion_retention.sql uses the same number; a test checks they agree.
   */
  auditLogYears: 6,
  // Sessions last 7 days (lib/better-auth.ts) and rate-limit rows a day (lib/rate-limit.ts):
  // both are deleted once expired, so they need no number here.
} as const;

const yearsBefore = (now: Date, years: number) => {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

/**
 * Deletes everything past its retention period. Returns how many rows of each kind went,
 * for the cron log (counts only, nothing about who).
 *
 * Appointments that have a payment are kept: financial records follow their own rules, and
 * the payment row would block the delete anyway (payments.appointment_id is ON DELETE RESTRICT).
 */
export async function purgeExpiredData(now = new Date()) {
  const appointmentCutoff = yearsBefore(now, RETENTION.appointmentYears);
  // The audit cut-off uses the database's clock, the same now() the append-only trigger checks.
  // With the app's clock, a row on the boundary could be one the trigger refuses, which would
  // roll back the whole purge.
  const auditCutoff = sql`now() - make_interval(years => ${RETENTION.auditLogYears})`;

  return db.transaction(async (tx) => {
    const expiredSessions = await tx.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
    const expiredVerifications = await tx.delete(verifications).where(lt(verifications.expiresAt, now)).returning({ id: verifications.id });

    // Their history events go with them (appointment_events cascades). A newer appointment that
    // replaced one of these keeps going: its rescheduled_from_id link is set to null.
    const old = tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          lt(appointments.endsAt, appointmentCutoff),
          notExists(tx.select({ one: sql`1` }).from(payments).where(sql`${payments.appointmentId} = ${appointments.id}`)),
        ),
      );
    const oldAppointments = await tx.delete(appointments).where(inArray(appointments.id, old)).returning({ id: appointments.id });

    const oldAudit = await tx.delete(auditLog).where(lt(auditLog.at, auditCutoff)).returning({ id: auditLog.id });

    return {
      sessions: expiredSessions.length,
      verifications: expiredVerifications.length,
      appointments: oldAppointments.length,
      auditRows: oldAudit.length,
    };
  });
}
