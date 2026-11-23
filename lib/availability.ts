// Parses and validates the /availability forms. Pure: no database, no clock, so
// it's easy to test. The server actions call these and never trust raw form data.
import { BOOKING_MODES } from "./db/schema";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type WeeklyRange = { weekday: number; startTime: string; endTime: string };
export type BookingSettings = { bookingMode: (typeof BOOKING_MODES)[number]; slotMinutes: number };
export type ExceptionInput = { date: string; startTime: string | null; endTime: string | null; note: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The form shows this many hour rows per day at most. */
const MAX_ROWS_PER_DAY = 10;

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not). */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Booking mode and slot length. Limits match the practitioners table's check constraints. */
export function parseBookingSettings(fd: FormData): Result<BookingSettings> {
  const mode = text(fd, "mode");
  if (!(BOOKING_MODES as readonly string[]).includes(mode)) return { ok: false, error: "bad-mode" };

  const raw = text(fd, "slotMinutes");
  const slotMinutes = Number(raw);
  if (!/^\d+$/.test(raw) || slotMinutes < 1 || slotMinutes > 480) return { ok: false, error: "bad-slot-length" };

  return { ok: true, data: { bookingMode: mode as BookingSettings["bookingMode"], slotMinutes } };
}

/**
 * Weekly hours from the form. A day only counts if its checkbox is on; rows with
 * both times blank are skipped, which is how the spare "add another range" row works.
 */
export function parseWeeklyHours(fd: FormData): Result<WeeklyRange[]> {
  const out: WeeklyRange[] = [];

  for (let weekday = 0; weekday < 7; weekday++) {
    if (fd.get(`day-${weekday}`) === null) continue;

    const ranges: WeeklyRange[] = [];
    for (let i = 0; i < MAX_ROWS_PER_DAY; i++) {
      const startTime = text(fd, `d${weekday}-${i}-from`);
      const endTime = text(fd, `d${weekday}-${i}-to`);
      if (!startTime && !endTime) continue;
      if (!TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, error: "bad-time" };
      if (mins(endTime) <= mins(startTime)) return { ok: false, error: "bad-range" };
      ranges.push({ weekday, startTime, endTime });
    }

    ranges.sort((a, b) => mins(a.startTime) - mins(b.startTime));
    for (let i = 1; i < ranges.length; i++) {
      if (mins(ranges[i].startTime) < mins(ranges[i - 1].endTime)) return { ok: false, error: "overlap" };
    }
    out.push(...ranges);
  }

  return { ok: true, data: out };
}

/** One date exception. `today` is the practitioner's local date, so "past" means past for them. */
export function parseException(fd: FormData, today: string): Result<ExceptionInput> {
  const date = text(fd, "date");
  if (!isDayKey(date)) return { ok: false, error: "bad-date" };
  if (date < today) return { ok: false, error: "past-date" };

  const note = text(fd, "note");
  if (note.length > 200) return { ok: false, error: "note-too-long" };

  const kind = text(fd, "kind");
  if (kind === "closed") return { ok: true, data: { date, startTime: null, endTime: null, note } };
  if (kind !== "hours") return { ok: false, error: "bad-kind" };

  const startTime = text(fd, "from");
  const endTime = text(fd, "to");
  if (!TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, error: "bad-time" };
  if (mins(endTime) <= mins(startTime)) return { ok: false, error: "bad-range" };
  return { ok: true, data: { date, startTime, endTime, note } };
}