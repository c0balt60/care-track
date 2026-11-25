// Parses and validates the /availability forms with Zod (HRD-3 #37). Pure: no database,
// no clock, so it's easy to test. The server actions call these and never trust raw form data.
import { z } from "zod";
import { BOOKING_MODES } from "./db/schema";
import { dayKey, optionalText, parse, time, type Parsed } from "./validation";

export type Result<T> = Parsed<T>;

export type WeeklyRange = { weekday: number; startTime: string; endTime: string };
export type BookingSettings = { bookingMode: (typeof BOOKING_MODES)[number]; slotMinutes: number };
export type ExceptionInput = { date: string; startTime: string | null; endTime: string | null; note: string };

/** The form shows this many hour rows per day at most. */
const MAX_ROWS_PER_DAY = 10;

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ends = (r: { startTime: string; endTime: string }) => mins(r.endTime) > mins(r.startTime);

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not). */
export const isDayKey = (value: string) => dayKey("bad-date").safeParse(value).success;

/** Booking mode and slot length. Limits match the practitioners table's check constraints. */
const bookingSettings = z
  .object({
    mode: z.enum(BOOKING_MODES, { error: "bad-mode" }),
    slotMinutes: z
      .string({ error: "bad-slot-length" })
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number({ error: "bad-slot-length" }).min(1).max(480)),
  })
  .transform(({ mode, slotMinutes }): BookingSettings => ({ bookingMode: mode, slotMinutes }));

export const parseBookingSettings = (fd: FormData): Result<BookingSettings> => parse(bookingSettings, fd);

/** One start-end range; the end must come after the start. */
const range = z
  .object({ startTime: time("bad-time"), endTime: time("bad-time") })
  .refine(ends, { error: "bad-range" });

/** One day's ranges, which can't overlap each other. Output is sorted by start time. */
const dayRanges = z
  .array(range)
  .transform((rs) => rs.toSorted((a, b) => mins(a.startTime) - mins(b.startTime)))
  .refine((rs) => rs.every((r, i) => i === 0 || mins(r.startTime) >= mins(rs[i - 1].endTime)), { error: "overlap" });

const weeklyHours = z.array(z.object({ weekday: z.int().min(0).max(6), ranges: dayRanges }));

/**
 * Weekly hours from the form. A day only counts if its checkbox is on; rows with
 * both times blank are skipped, which is how the spare "add another range" row works.
 */
export function parseWeeklyHours(fd: FormData): Result<WeeklyRange[]> {
  // The field names carry the day and row ("d1-0-from"), so gather them into a shape first.
  const field = (key: string) => fd.get(key) ?? "";
  const days = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (fd.get(`day-${weekday}`) === null) continue;
    const ranges = [];
    for (let i = 0; i < MAX_ROWS_PER_DAY; i++) {
      const startTime = field(`d${weekday}-${i}-from`);
      const endTime = field(`d${weekday}-${i}-to`);
      if (startTime === "" && endTime === "") continue;
      ranges.push({ startTime, endTime });
    }
    days.push({ weekday, ranges });
  }

  const parsed = parse(weeklyHours, days);
  if (!parsed.ok) return parsed;
  return { ok: true, data: parsed.data.flatMap((d) => d.ranges.map((r) => ({ weekday: d.weekday, ...r }))) };
}

/** One date exception: closed all day, or open for custom hours. */
const exception = (today: string) => {
  const common = {
    date: dayKey("bad-date").refine((d) => d >= today, { error: "past-date" }),
    note: optionalText(200, "note-too-long"),
  };
  return z
    .discriminatedUnion(
      "kind",
      [
        z.object({ ...common, kind: z.literal("closed") }),
        z
          .object({ ...common, kind: z.literal("hours"), from: time("bad-time"), to: time("bad-time") })
          .refine((e) => ends({ startTime: e.from, endTime: e.to }), { error: "bad-range" }),
      ],
      { error: "bad-kind" },
    )
    .transform(
      (e): ExceptionInput =>
        e.kind === "closed"
          ? { date: e.date, startTime: null, endTime: null, note: e.note }
          : { date: e.date, startTime: e.from, endTime: e.to, note: e.note },
    );
};

/** One date exception. `today` is the practitioner's local date, so "past" means past for them. */
export const parseException = (fd: FormData, today: string): Result<ExceptionInput> => parse(exception(today), fd);
