// Open slots for many practitioners at once (SCH-3 #21).
//
// "Open" means: inside the practitioner's hours (weekly rules + date exceptions),
// in the future, inside the booking window, and not overlapping a live
// appointment. /search, the home page and the practitioner cards all use this.
//
// It always runs 3 queries, however many practitioners are asked for, instead of
// 3 per practitioner (the "N+1" problem). Rows are grouped by practitioner in memory.
//
// The window and the slot ids match loadBookableSlot() in ./booking, so every id
// this returns is one /book/[slotId] accepts (a test checks this). This is only a
// display: booking still re-checks the slot, and the database's overlap
// constraint has the final say if two people pick the same time.
import { and, gt, gte, inArray, lt, notInArray } from "drizzle-orm";
import { BOOKING_WINDOW_DAYS, slotIdFor } from "./booking";
import { addDays, dayKey } from "./dates";
import { db } from "./db";
import { appointments, availabilityExceptions, availabilityRules, type practitioners } from "./db/schema";
import { generateSlots } from "./slots";

export type OpenSlot = { id: string; start: Date; end: Date };

/** The practitioner columns slot generation needs. Callers usually have the row already. */
export type SlotPractitioner = Pick<typeof practitioners.$inferSelect, "id" | "timeZone" | "slotMinutes">;

/** Groups rows into a Map keyed by practitioner id. */
function byPractitioner<T extends { practitionerId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.practitionerId, [...(map.get(row.practitionerId) ?? []), row]);
  return map;
}

/**
 * Open slots per practitioner id, each list sorted soonest first. Every
 * practitioner passed in gets an entry, an empty list if they have no openings.
 *
 * `days` can shorten the window (e.g. the home page only needs the next week),
 * but never lengthen it: slots past the booking window couldn't be booked.
 */
export async function openSlotsFor(
  list: SlotPractitioner[],
  { now = new Date(), days = BOOKING_WINDOW_DAYS }: { now?: Date; days?: number } = {},
): Promise<Map<string, OpenSlot[]>> {
  const result = new Map<string, OpenSlot[]>(list.map((p) => [p.id, []]));
  if (!list.length) return result;
  days = Math.min(days, BOOKING_WINDOW_DAYS);

  const ids = list.map((p) => p.id);
  // Each practitioner's window starts on "today" in their own zone, which can be
  // a day either side of today in UTC. Pad the shared date range by a day each
  // way; generateSlots only reads the dates inside each practitioner's window.
  const first = addDays(dayKey(now, "UTC"), -1);
  const last = addDays(first, days + 2);
  const windowEnd = new Date(now.getTime() + (days + 2) * 86_400_000);

  const [rules, exceptions, booked] = await Promise.all([
    db
      .select({
        practitionerId: availabilityRules.practitionerId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(inArray(availabilityRules.practitionerId, ids)),
    db
      .select({
        practitionerId: availabilityExceptions.practitionerId,
        date: availabilityExceptions.date,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
      })
      .from(availabilityExceptions)
      .where(
        and(
          inArray(availabilityExceptions.practitionerId, ids),
          gte(availabilityExceptions.date, first),
          lt(availabilityExceptions.date, last),
        ),
      ),
    // Pending requests hold their time too, the same rule the overlap constraint uses.
    db
      .select({ practitionerId: appointments.practitionerId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          inArray(appointments.practitionerId, ids),
          notInArray(appointments.status, ["cancelled", "declined"]),
          gt(appointments.endsAt, now),
          lt(appointments.startsAt, windowEnd),
        ),
      ),
  ]);

  const rulesOf = byPractitioner(rules);
  const exceptionsOf = byPractitioner(exceptions);
  const bookedOf = byPractitioner(booked);

  for (const p of list) {
    const taken = bookedOf.get(p.id) ?? [];
    const slots = generateSlots({
      timeZone: p.timeZone,
      slotMinutes: p.slotMinutes,
      rules: rulesOf.get(p.id) ?? [],
      exceptions: exceptionsOf.get(p.id) ?? [],
      from: dayKey(now, p.timeZone),
      days,
    });
    result.set(
      p.id,
      slots
        .filter((s) => s.start > now)
        // Two ranges overlap when each one starts before the other ends.
        .filter((s) => !taken.some((a) => a.startsAt < s.end && a.endsAt > s.start))
        .map((s) => ({ id: slotIdFor(p.id, s.start), start: s.start, end: s.end })),
    );
  }
  return result;
}

/** Start time of the first open slot in ms, or Infinity if none. Handy for sorting. */
export const soonest = (slots: OpenSlot[] | undefined) => slots?.[0]?.start.getTime() ?? Infinity;
