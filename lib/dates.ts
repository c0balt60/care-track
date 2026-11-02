// Date math and formatting on Intl, so no date library is needed.
// Times always show in the practitioner's or clinic's time zone.

/** A calendar day as "YYYY-MM-DD". */
export type DayKey = string;

function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** How far a time zone's wall clock is ahead of UTC at this moment, in ms. */
function offsetAt(time: number, timeZone: string) {
  const w = wallClock(new Date(time), timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - time;
}

/**
 * The moment a wall-clock time happens in a time zone, e.g. 9:30 on Oct 8 in New York.
 *
 * Around daylight saving changes: a time that happens twice (1:30 on the fall-back
 * night) gives the first one, and a time that never happens (2:30 on the
 * spring-forward night) gives some nearby moment. Use `minuteOfDay` to check.
 */
export function zoned(day: DayKey, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // The offset at `guess` can be on the wrong side of a DST change, so check it
  // again at the moment we landed on and correct once if it differs.
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  return new Date(second);
}

/** Minutes since midnight on the wall clock, e.g. 9:30 → 570. */
export function minuteOfDay(date: Date, timeZone: string): number {
  const w = wallClock(date, timeZone);
  return w.hour * 60 + w.minute;
}

export function dayKey(date: Date, timeZone: string): DayKey {
  const w = wallClock(date, timeZone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday */
export function weekday(day: DayKey): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** "09:30" → 570 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const fmt = (date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);

/** "Tue, Oct 8" */
export const formatDay = (date: Date, timeZone: string) =>
  fmt(date, timeZone, { weekday: "short", month: "short", day: "numeric" });

/** "Tue, Oct 8" for a DayKey */
export const formatDayKey = (day: DayKey) => formatDay(new Date(`${day}T12:00:00Z`), "UTC");

/** "10:30 AM" */
export const formatTime = (date: Date, timeZone: string) =>
  fmt(date, timeZone, { hour: "numeric", minute: "2-digit" });

/** "EDT" */
export const formatZone = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? "";

/** "Tue, Oct 8 · 10:30 AM EDT" */
export const formatWhen = (date: Date, timeZone: string) =>
  `${formatDay(date, timeZone)} · ${formatTime(date, timeZone)} ${formatZone(date, timeZone)}`;
