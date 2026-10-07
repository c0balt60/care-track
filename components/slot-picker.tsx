import Link from "next/link";
import { addDays, dayKey, formatDayKey, formatTime, formatWhen, formatZone } from "@/lib/dates";
import { BOOKING_WINDOW_DAYS, type Practitioner, slotsFor, today } from "@/lib/mock-data";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const utc = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });

/**
 * Week strip plus time chips for the selected day. The week and day live in the
 * URL (?week=&day=), so this needs no client state and the back button works.
 * `query` is carried along on every link, e.g. { reschedule: "a1" }.
 */
export function SlotPicker({ p, week, day, query = {} }: { p: Practitioner; week: number; day?: string; query?: Record<string, string> }) {
  const tz = p.timeZone;
  const lastWeek = Math.ceil(BOOKING_WINDOW_DAYS / 7) - 1;
  const w = Math.min(Math.max(week, 0), lastWeek);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(tz), w * 7 + i));

  const byDay = new Map<string, ReturnType<typeof slotsFor>>();
  for (const s of slotsFor(p)) {
    const d = dayKey(s.start, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const selected = day && days.includes(day) ? day : (days.find((d) => byDay.has(d)) ?? days[0]);
  const times = byDay.get(selected) ?? [];

  const href = (w: number, d?: string) =>
    `/practitioners/${p.id}?${new URLSearchParams({ ...query, week: String(w), ...(d && { day: d }) })}`;
  const carry = Object.keys(query).length ? `?${new URLSearchParams(query)}` : "";
  const arrow = "btn btn-secondary px-3";

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {w > 0 ? (
          <Link href={href(w - 1)} scroll={false} className={arrow} aria-label="Previous week">
            <ChevronLeftIcon />
          </Link>
        ) : (
          <span className={`${arrow} opacity-40`} aria-hidden="true"><ChevronLeftIcon /></span>
        )}
        <p className="font-medium">
          {utc(days[0], { month: "short", day: "numeric" })} – {utc(days[6], { month: "short", day: "numeric" })}
        </p>
        {w < lastWeek ? (
          <Link href={href(w + 1)} scroll={false} className={arrow} aria-label="Next week">
            <ChevronRightIcon />
          </Link>
        ) : (
          <span className={`${arrow} opacity-40`} aria-hidden="true"><ChevronRightIcon /></span>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-7 gap-1 text-center">
        {days.map((d) => {
          const n = byDay.get(d)?.length ?? 0;
          const cell = (
            <>
              <span aria-hidden="true" className="text-xs">{utc(d, { weekday: "short" })}</span>
              <span aria-hidden="true" className="text-base font-semibold">{Number(d.slice(8))}</span>
              <span aria-hidden="true" className="text-xs">{n || "–"}</span>
              <span className="sr-only">{formatDayKey(d)}, {n ? `${n} open times` : "no open times"}</span>
            </>
          );
          const base = "flex min-h-11 flex-col items-center rounded-lg py-1.5";
          return (
            <li key={d}>
              {n ? (
                <Link
                  href={href(w, d)}
                  scroll={false}
                  aria-current={d === selected ? "true" : undefined}
                  className={`${base} ${d === selected ? "bg-accent text-white" : "bg-accent-soft text-teal-800 hover:bg-teal-100"}`}
                >
                  {cell}
                </Link>
              ) : (
                <span className={`${base} text-muted`}>{cell}</span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 text-sm font-medium">
        {formatDayKey(selected)} · times in {formatZone(times[0]?.start ?? new Date(), tz)}
      </h3>
      {times.length ? (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {times.map((s) => (
            <li key={s.id}>
              <Link href={`/book/${s.id}${carry}`} className="chip w-full px-2" aria-label={`Book ${formatWhen(s.start, tz)}`}>
                {formatTime(s.start, tz)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No open times this week. Try the next week.</p>
      )}
    </div>
  );
}
