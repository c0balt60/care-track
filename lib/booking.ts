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
};
export type BookingError = keyof typeof bookingErrors;

/** Postgres "exclusion_violation": the overlap constraint rejected the insert. */
function isOverlap(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23P01" || e?.cause?.code === "23P01";
}

/**
 * Books a slot for a signed-in patient. Instant-mode practitioners are confirmed
 * right away; approval-mode ones get a pending request.
 */
export async function bookSlot(
  patient: { userId: string; patientId: string },
  slotId: string,
  reasonInput: unknown,
  now = new Date(),
): Promise<{ ok: true; appointmentId: string; status: "confirmed" | "pending" } | { ok: false; error: BookingError }> {
  const reason = String(reasonInput ?? "").trim();
  if (!reason || reason.length > 1000) return { ok: false, error: "reason" };

  const found = await loadBookableSlot(slotId, now);
  if (!found) return { ok: false, error: "slot" };
  const { practitioner, slot } = found;
  const status = practitioner.bookingMode === "instant" ? "confirmed" : "pending";

  try {
    const id = await db.transaction(async (tx) => {
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
      await audit(patient.userId, "appointment.book", "appointments", appt.id, { status: { from: null, to: status } }, tx);
      return appt.id;
    });
    return { ok: true, appointmentId: id, status };
  } catch (err) {
    if (isOverlap(err)) return { ok: false, error: "taken" };
    throw err;
  }
}