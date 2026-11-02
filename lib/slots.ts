// Turns a practitioner's weekly hours and date exceptions into bookable slots.
// Pure: no database, no clock, no appointments. Callers drop past and booked
// slots themselves, so the same inputs always give the same output.
import type { availabilityExceptions, availabilityRules } from "./db/schema";
import { addDays, dayKey, minuteOfDay, toMinutes, weekday, zoned, type DayKey } from "./dates";

/** Only the columns we need, so callers can pass DB rows straight in. */
export type WeeklyRule = Pick<typeof availabilityRules.$inferSelect, "weekday" | "startTime" | "endTime">;
export type DateException = Pick<typeof availabilityExceptions.$inferSelect, "date" | "startTime" | "endTime">;

export type GeneratedSlot = { start: Date; end: Date };

export type SlotInput = {
  /** IANA zone the hours are written in, e.g. "America/New_York". */
  timeZone: string;
  slotMinutes: number;
  rules: WeeklyRule[];
  exceptions: DateException[];
  /** First day to generate, in the practitioner's zone. */
  from: DayKey;
  /** How many days, starting at `from`. */
  days: number;
};

/**
 * The open ranges for one day, as [startMinute, endMinute] pairs.
 * Any exception on that date replaces the weekly hours completely; an
 * exception with no times means closed all day.
 */
function rangesFor(day: DayKey, rules: WeeklyRule[], exceptions: DateException[]): [number, number][] {
  const overrides = exceptions.filter((e) => e.date === day);
  if (overrides.length > 0) {
    return overrides.flatMap((e) =>
      e.startTime && e.endTime ? [[toMinutes(e.startTime), toMinutes(e.endTime)] as [number, number]] : [],
    );
  }
  const wd = weekday(day);
  return rules.filter((r) => r.weekday === wd).map((r) => [toMinutes(r.startTime), toMinutes(r.endTime)]);
}

/** Every slot in the window, sorted by start time. */
export function generateSlots(input: SlotInput): GeneratedSlot[] {
  const { timeZone, slotMinutes, rules, exceptions, from, days } = input;
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
    throw new RangeError(`slotMinutes must be a positive whole number, got ${slotMinutes}`);
  }

  // Keyed by start time, so overlapping ranges can't produce the same slot twice.
  const slots = new Map<number, GeneratedSlot>();

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    for (const [open, close] of rangesFor(day, rules, exceptions)) {
      // Only whole slots: a 9:00–9:50 range with 30-minute slots gives just 9:00.
      for (let m = open; m + slotMinutes <= close; m += slotMinutes) {
        const start = zoned(day, m, timeZone);
        // Skip wall-clock times that don't exist (the hour skipped when clocks spring forward).
        if (dayKey(start, timeZone) !== day || minuteOfDay(start, timeZone) !== m) continue;
        // Length is real elapsed time, so a 30-minute slot is 30 minutes even across a DST change.
        slots.set(start.getTime(), { start, end: new Date(start.getTime() + slotMinutes * 60_000) });
      }
    }
  }

  return [...slots.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
