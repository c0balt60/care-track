// Booking a slot (SCH-4 #22). The page and the server action both go through here.
//
// A slot id is "<practitioner uuid>_<start time in ms>". It comes from the URL, so
// nothing in it is trusted: the slot is rebuilt from the practitioner's real hours
// and must still be in the future and inside the booking window.
//
// Double bookings are stopped by the appointments_no_overlap constraint (DB-3 #9),
// not by checking first: two people can pass any check at the same moment, but only
// one insert can win. The loser gets error "taken", which the page shows kindly.
import { and, eq, gt, lt, notInArray } from "drizzle-orm";
import { can } from "./appointment-rules";
import { audit } from "./audit";
import { addDays, dayKey } from "./dates";
import { db } from "./db";
import { appointmentEvents, appointments, availabilityExceptions, availabilityRules, clinics, practitioners } from "./db/schema";
import { generateSlots } from "./slots";

/** How far ahead patients can book. Matches the prototype (open question 4 in the outline). */
export const BOOKING_WINDOW_DAYS = 28;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds the id used in /book/[slotId] links. */
export const slotIdFor = (practitionerId: string, start: Date) => `${practitionerId}_${start.getTime()}`;

function parseSlotId(slotId: string): { practitionerId: string; startMs: number } | null {
  const [practitionerId, ms, ...rest] = decodeURIComponent(slotId).split("_");
  const startMs = Number(ms);
  if (rest.length || !UUID.test(practitionerId ?? "") || !Number.isSafeInteger(startMs)) return null;
  return { practitionerId, startMs };
}

/**
 * The practitioner, their clinic and the slot, or null if the id doesn't match a real,
 * future slot inside the booking window. `taken` says whether a live appointment
 * already overlaps it (for showing the page; booking doesn't rely on it).
 */
export async function loadBookableSlot(slotId: string, now = new Date()) {
  const parsed = parseSlotId(slotId);
  if (!parsed || parsed.startMs <= now.getTime()) return null;

  const [row] = await db
    .select({ practitioner: practitioners, clinic: clinics })
    .from(practitioners)
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .where(eq(practitioners.id, parsed.practitionerId))
    .limit(1);
  if (!row) return null;
  const { practitioner: p, clinic } = row;

  const from = dayKey(now, p.timeZone);
  const [rules, exceptions] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.practitionerId, p.id)),
    db
      .select()
      .from(availabilityExceptions)
      .where(eq(availabilityExceptions.practitionerId, p.id)),
  ]);
  const slot = generateSlots({
    timeZone: p.timeZone,
    slotMinutes: p.slotMinutes,
    rules,
    exceptions: exceptions.filter((e) => e.date >= from && e.date < addDays(from, BOOKING_WINDOW_DAYS)),
    from,
    days: BOOKING_WINDOW_DAYS,
  }).find((s) => s.start.getTime() === parsed.startMs);
  if (!slot) return null;

  const [clash] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.practitionerId, p.id),
        notInArray(appointments.status, ["cancelled", "declined"]),
        lt(appointments.startsAt, slot.end),
        gt(appointments.endsAt, slot.start),
      ),
    )
    .limit(1);

  return { practitioner: p, clinic, slot, taken: Boolean(clash) };
}

/** Messages for /book/[slotId]?error=. Only these keys are shown, so the URL can't inject text. */
export const bookingErrors = {
  slot: "This time isn't available anymore. Pick another time.",
  taken: "Someone just booked this time. Pick another time.",
  reason: "Tell us the reason for your visit (up to 1,000 characters).",
  staff: "Booking for a patient from the front desk isn't ready yet.",
  reschedule: "That appointment can't be moved anymore. Check your appointments for its latest status.",
  reschedule_pending: "You already asked to move that appointment. Withdraw that request first to pick a different time.",
};
export type BookingError = keyof typeof bookingErrors;

type PgError = { code?: string; constraint?: string };
/** The Postgres error, whether the driver throws it directly or wraps it in `cause`. */
const pgError = (err: unknown): PgError => {
  const e = err as PgError & { cause?: PgError };
  return e?.code ? e : (e?.cause ?? {});
};

/** Postgres "exclusion_violation": the overlap constraint rejected the insert. */
function isOverlap(err: unknown) {
  return pgError(err).code === "23P01";
}

/** Postgres "unique_violation" on the one-pending-move-request index. Exported for tests. */
export function isPendingMoveClash(err: unknown) {
  const e = pgError(err);
  return e.code === "23505" && e.constraint === "appointments_one_pending_move";
}

/** Thrown inside the transaction to roll it back and report a booking error. */
class BookingRefused extends Error {
  constructor(readonly error: BookingError) {
    super(error);
  }
}

/**
 * Books a slot for a signed-in patient. Instant-mode practitioners are confirmed
 * right away; approval-mode ones get a pending request.
 *
 * With `rescheduleFromId`, the new appointment replaces one of the patient's
 * confirmed appointments with the same practitioner (SCH-5 #23):
 * - instant mode: the old one is cancelled and the new one confirmed in the same
 *   transaction. Cancelling first frees its time, so the overlap constraint
 *   doesn't trip on the patient's own appointment.
 * - approval mode: the new one is a pending request linked to the old one, which
 *   stays booked. approve() in lib/appointments.ts cancels the old one when the
 *   request is accepted; a decline or withdrawal leaves it alone.
 */
export async function bookSlot(
  patient: { userId: string; patientId: string },
  slotId: string,
  reasonInput: unknown,
  now = new Date(),
  { rescheduleFromId }: { rescheduleFromId?: string | null } = {},
): Promise<{ ok: true; appointmentId: string; status: "confirmed" | "pending" } | { ok: false; error: BookingError }> {
  const reason = String(reasonInput ?? "").trim();
  if (!reason || reason.length > 1000) return { ok: false, error: "reason" };
  if (rescheduleFromId != null && !UUID.test(rescheduleFromId)) return { ok: false, error: "reschedule" };

  const found = await loadBookableSlot(slotId, now);
  if (!found) return { ok: false, error: "slot" };
  const { practitioner, slot } = found;
  const status = practitioner.bookingMode === "instant" ? "confirmed" : "pending";

  try {
    const id = await db.transaction(async (tx) => {
      if (rescheduleFromId) {
        await checkReschedule(tx, patient, rescheduleFromId, practitioner, now);
        // Lost a race with the clinic cancelling it since checkReschedule read it.
        if (status === "confirmed" && !(await replaceOld(tx, rescheduleFromId, patient.userId, "patient", now))) {
          throw new BookingRefused("reschedule");
        }
      }

      const [appt] = await tx
        .insert(appointments)
        .values({
          practitionerId: practitioner.id,
          patientId: patient.patientId,
          startsAt: slot.start,
          endsAt: slot.end,
          status,
          reason,
          bookedBy: "patient",
          rescheduledFromId: rescheduleFromId ?? null,
        })
        .returning({ id: appointments.id });

      await tx.insert(appointmentEvents).values(
        [
          { appointmentId: appt.id, type: "booked" as const, actorUserId: patient.userId, actorRole: "patient" as const },
          // Instant mode confirms in the same step, so the timeline shows both.
          ...(status === "confirmed"
            ? [{ appointmentId: appt.id, type: "confirmed" as const, actorUserId: null, actorRole: null }]
            : []),
        ],
      );
      await audit(
        patient.userId,
        "appointment.book",
        "appointments",
        appt.id,
        {
          status: { from: null, to: status },
          ...(rescheduleFromId && { rescheduledFromId: { from: null, to: rescheduleFromId } }),
        },
        tx,
      );
      return appt.id;
    });
    return { ok: true, appointmentId: id, status };
  } catch (err) {
    if (err instanceof BookingRefused) return { ok: false, error: err.error };
    if (isOverlap(err)) return { ok: false, error: "taken" };
    // Lost a race with another move request for the same appointment.
    if (isPendingMoveClash(err)) return { ok: false, error: "reschedule_pending" };
    throw err;
  }
}

/** A transaction handle from db.transaction(). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The appointment being moved must be the patient's, with the same practitioner,
 * and movable under the rules (confirmed, not started). Only one pending move
 * request at a time, so approving one can't leave another pointing at a
 * cancelled appointment.
 */
async function checkReschedule(
  tx: Tx,
  patient: { patientId: string },
  oldId: string,
  practitioner: { id: string; clinicId: string | null },
  now: Date,
) {
  const [old] = await tx.select().from(appointments).where(eq(appointments.id, oldId)).limit(1);
  const movable =
    old &&
    old.practitionerId === practitioner.id &&
    can(
      { role: "patient", patientId: patient.patientId },
      { ...old, clinicId: practitioner.clinicId },
      "reschedule",
      now,
    );
  if (!movable) throw new BookingRefused("reschedule");

  const [waiting] = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.rescheduledFromId, oldId), eq(appointments.status, "pending")))
    .limit(1);
  if (waiting) throw new BookingRefused("reschedule_pending");
}

/**
 * Cancels the appointment a reschedule replaces, with a "rescheduled" event and
 * an audit row. It counts as cancelled by the patient, who asked for the move,
 * even when a practitioner's approval is what triggers it.
 *
 * Returns false (and changes nothing) if the old appointment is no longer a
 * confirmed, upcoming one, e.g. the clinic cancelled it while the request waited.
 */
export async function replaceOld(
  tx: Tx,
  oldId: string,
  actorUserId: string,
  actorRole: "patient" | "practitioner" | "staff",
  now = new Date(),
): Promise<boolean> {
  const updated = await tx
    .update(appointments)
    .set({ status: "cancelled", cancelledBy: "patient", cancelReason: "Rescheduled" })
    .where(and(eq(appointments.id, oldId), eq(appointments.status, "confirmed"), gt(appointments.startsAt, now)))
    .returning({ id: appointments.id });
  if (!updated.length) return false;

  await tx.insert(appointmentEvents).values({ appointmentId: oldId, type: "rescheduled", actorUserId, actorRole });
  await audit(actorUserId, "appointment.reschedule", "appointments", oldId, { status: { from: "confirmed", to: "cancelled" } }, tx);
  return true;
}