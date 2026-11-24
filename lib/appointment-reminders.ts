// Reminder emails (EML-3 #28). The cron route calls sendDueReminders() on a schedule.
//
// "Call it twice, send one email" comes from claiming each appointment before sending:
//   UPDATE appointments SET reminder_sent_at = ... WHERE id = $1 AND reminder_sent_at IS NULL
// Only one UPDATE can find the row still null; a second call (or an overlapping run)
// updates nothing and skips it. Claiming one row at a time also means a crash or timeout
// can lose at most the one reminder that was in flight.
//
// If sending fails, the claim is released so the next run tries again.
import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";
import { appointmentLink, scrub } from "./appointment-emails";
import { db } from "./db";
import { appointments, patients, practitioners, users } from "./db/schema";
import { sendEmail } from "./email";
import { appointmentEmail } from "./email-templates";
import { logger } from "./logger";

const log = logger.child({ module: "appointment-reminders" });

/** A confirmed appointment gets its reminder once it starts within this many hours. */
export const REMINDER_LEAD_HOURS = 24;

/** Most appointments one run handles. Anything left over is picked up next run. */
const BATCH = 200;

export type ReminderRun = { due: number; sent: number; skipped: number; failed: number };

export async function sendDueReminders(now = new Date()): Promise<ReminderRun> {
  const horizon = new Date(now.getTime() + REMINDER_LEAD_HOURS * 3_600_000);

  const due = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.status, "confirmed"),
        isNull(appointments.reminderSentAt),
        gt(appointments.startsAt, now),
        lte(appointments.startsAt, horizon),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(BATCH);

  const run: ReminderRun = { due: due.length, sent: 0, skipped: 0, failed: 0 };

  for (const { id } of due) {
    // Claim it. If another run got there first, or it was cancelled meanwhile, nothing updates.
    const [claimed] = await db
      .update(appointments)
      .set({ reminderSentAt: now })
      .where(and(eq(appointments.id, id), eq(appointments.status, "confirmed"), isNull(appointments.reminderSentAt)))
      .returning({ id: appointments.id });
    if (!claimed) continue;

    try {
      if ((await sendReminder(id)) === "sent") run.sent++;
      else run.skipped++;
    } catch (err) {
      run.failed++;
      log.error({ appointmentId: id, error: scrub(err instanceof Error ? err.message : String(err)) }, "reminder failed, will retry next run");
      try {
        await db.update(appointments).set({ reminderSentAt: null }).where(eq(appointments.id, id));
      } catch {
        log.error({ appointmentId: id }, "could not release the reminder claim");
      }
    }
  }

  return run;
}

async function sendReminder(appointmentId: string): Promise<"sent" | "skipped"> {
  const [row] = await db
    .select({
      startsAt: appointments.startsAt,
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

  // Patients the front desk created have no account email. Nothing to send, nothing to retry.
  if (!row?.patientEmail) return "skipped";

  const email = appointmentEmail({
    kind: "reminder",
    patientFirstName: row.patientName.trim().split(/\s+/)[0] ?? "",
    practitionerName: row.practitionerName,
    startsAt: row.startsAt,
    timeZone: row.timeZone,
    url: appointmentLink(appointmentId),
  });
  await sendEmail({ to: row.patientEmail, ...email });
  return "sent";
}