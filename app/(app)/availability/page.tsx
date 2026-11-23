import { and, asc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlusIcon } from "@/components/icons";
import { Notice, noticeText, PageHeader, param } from "@/components/ui";
import { getViewerAs, requireRole } from "@/lib/auth";
import { dayKey, formatDayKey, formatZone } from "@/lib/dates";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, practitioners } from "@/lib/db/schema";
import { openSlotsFor } from "@/lib/open-slots";
import { addException, removeException, saveAvailability } from "./actions";

const days: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];

/** "13:00" → "1:00 PM" */
const t12 = (hhmm: string) =>
  new Date(`1970-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

const option = "flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft";

const errors: Record<string, string> = {
  "bad-mode": "Choose how bookings are handled.",
  "bad-slot-length": "Slot length must be between 1 and 480 minutes.",
  "bad-time": "Enter both a start and an end time.",
  "bad-range": "The end time must be after the start time.",
  overlap: "Hours on the same day can't overlap.",
  "bad-date": "Enter a valid date.",
  "past-date": "Pick a date that isn't in the past.",
  "bad-kind": "Choose closed all day or different hours.",
  "note-too-long": "Keep the note under 200 characters.",
  "no-practitioner": "Only practitioners can edit availability.",
};

export default async function Availability({ searchParams }: PageProps<"/availability">) {
  await requireRole("practitioner");
  const viewer = await getViewerAs("practitioner");
  if (!viewer) redirect("/dashboard");
  const sp = await searchParams;

  const [p] = await db.select().from(practitioners).where(eq(practitioners.id, viewer.practitionerId)).limit(1);
  if (!p) redirect("/dashboard");

  const todayKey = dayKey(new Date(), p.timeZone);
  const [rules, exceptionRows, open] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.practitionerId, p.id)).orderBy(asc(availabilityRules.startTime)),
    db
      .select()
      .from(availabilityExceptions)
      .where(and(eq(availabilityExceptions.practitionerId, p.id), gte(availabilityExceptions.date, todayKey)))
      .orderBy(asc(availabilityExceptions.date), asc(availabilityExceptions.startTime)),
    openSlotsFor([p], { days: 14 }),
  ]);

  // Postgres returns "09:00:00"; the time inputs and t12() want "09:00".
  const hoursOf = (d: number): [string, string][] =>
    rules.filter((r) => r.weekday === d).map((r) => [r.startTime.slice(0, 5), r.endTime.slice(0, 5)]);

  // One entry per date, in case older data has several rows for the same day.
  const exceptions = new Map<string, { date: string; hours: [string, string][]; note: string }>();
  for (const e of exceptionRows) {
    const entry = exceptions.get(e.date) ?? { date: e.date, hours: [], note: e.note };
    if (e.startTime && e.endTime) entry.hours.push([e.startTime.slice(0, 5), e.endTime.slice(0, 5)]);
    exceptions.set(e.date, entry);
  }

  const soon = open.get(p.id)?.length ?? 0;
  const zone = formatZone(new Date(), p.timeZone);
  const slotOptions = [...new Set([15, 20, 30, 45, 60, p.slotMinutes])].sort((a, b) => a - b);
  const notice = noticeText(
    { saved: "Changes saved.", added: "Exception saved.", removed: "Exception removed." },
    param(sp.notice),
  );
  const error = noticeText(errors, param(sp.error));

  return (
    <>
      <PageHeader
        title="Availability"
        description={`When patients can book you. Times are in ${zone}.`}
        actions={<button form="availability" className="btn btn-primary">Save changes</button>}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice>{error}</Notice>}

      <form id="availability" action={saveAvailability} className="space-y-6">
        <section aria-labelledby="booking" className="card p-5">
          <h2 id="booking" className="text-lg font-semibold">Booking</h2>
          <fieldset className="mt-4">
            <legend className="label">Booking mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={option}>
                <input type="radio" name="mode" value="instant" defaultChecked={p.bookingMode === "instant"} className="mt-0.5 size-5" />
                <span><span className="block font-medium">Confirm instantly</span><span className="text-sm text-muted">Bookings are confirmed right away.</span></span>
              </label>
              <label className={option}>
                <input type="radio" name="mode" value="approval" defaultChecked={p.bookingMode === "approval"} className="mt-0.5 size-5" />
                <span><span className="block font-medium">Review each request</span><span className="text-sm text-muted">You accept or decline every booking.</span></span>
              </label>
            </div>
          </fieldset>
          <div className="mt-4 max-w-48">
            <label htmlFor="slotMinutes" className="label">Slot length</label>
            <select id="slotMinutes" name="slotMinutes" defaultValue={p.slotMinutes} className="input">
              {slotOptions.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </section>

        <section aria-labelledby="weekly" className="card p-5">
          <h2 id="weekly" className="text-lg font-semibold">Weekly hours</h2>
          <p className="mt-1 text-sm text-muted">To add a split shift, fill in the spare row on that day. Blank rows are ignored.</p>
          <ul className="mt-2 divide-y divide-line">
            {days.map(([d, name]) => {
              const ranges = hoursOf(d);
              // Open days get their hours plus one spare row; closed days get a 9–5 starting point.
              const rows: [string, string][] = ranges.length ? [...ranges, ["", ""]] : [["09:00", "17:00"]];
              return (
                // Unchecking a day hides its hours with CSS (:has), no JavaScript.
                <li key={d} className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex min-h-11 w-36 items-center gap-3 font-medium">
                    <input type="checkbox" name={`day-${d}`} defaultChecked={ranges.length > 0} className="size-5" />
                    {name}
                  </label>
                  <span className="text-muted group-has-checked:hidden">Unavailable</span>
                  <div className="hidden flex-wrap items-center gap-2 group-has-checked:flex">
                    {rows.map(([from, to], i) => (
                      <span key={i} className="flex items-center gap-1">
                        <label htmlFor={`d${d}-${i}-from`} className="sr-only">{name} from</label>
                        <input type="time" id={`d${d}-${i}-from`} name={`d${d}-${i}-from`} defaultValue={from} className="input w-auto" />
                        <span aria-hidden="true">–</span>
                        <label htmlFor={`d${d}-${i}-to`} className="sr-only">{name} until</label>
                        <input type="time" id={`d${d}-${i}-to`} name={`d${d}-${i}-to`} defaultValue={to} className="input w-auto" />
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </form>

      {/* Outside the form above: each dialog has its own form, and forms can't nest. */}
      <section aria-labelledby="exceptions" className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="exceptions" className="text-lg font-semibold">Exceptions</h2>
          <ConfirmDialog
            id="add-exception"
            trigger={<><PlusIcon /> Add exception</>}
            title="Add an exception"
            text="Close for a day, or set different hours for one date."
            confirm="Add exception"
            cancel="Cancel"
            action={addException}
          >
            <div>
              <label htmlFor="exDate" className="label">Date</label>
              <input type="date" id="exDate" name="date" min={todayKey} required className="input" />
            </div>
            <fieldset className="group space-y-2">
              <legend className="label">That day</legend>
              <label className="flex min-h-11 items-center gap-3"><input type="radio" name="kind" value="closed" defaultChecked className="size-5" /> Closed all day</label>
              <label className="flex min-h-11 items-center gap-3"><input type="radio" name="kind" value="hours" className="ex-hours size-5" /> Different hours</label>
              <div className="hidden items-center gap-1 pl-8 group-has-[.ex-hours:checked]:flex">
                <label htmlFor="exFrom" className="sr-only">From</label>
                <input type="time" id="exFrom" name="from" defaultValue="10:00" className="input w-auto" />
                <span aria-hidden="true">–</span>
                <label htmlFor="exTo" className="sr-only">Until</label>
                <input type="time" id="exTo" name="to" defaultValue="14:00" className="input w-auto" />
              </div>
            </fieldset>
            <div>
              <label htmlFor="exNote" className="label">Note (optional)</label>
              <input id="exNote" name="note" maxLength={200} placeholder="e.g. Holiday" className="input" />
            </div>
          </ConfirmDialog>
        </div>

        {exceptions.size === 0 && <p className="mt-2 text-muted">No upcoming exceptions.</p>}
        <ul className="mt-2 divide-y divide-line">
          {[...exceptions.values()].map((e) => (
            <li key={e.date} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span className="w-36 font-medium">{formatDayKey(e.date)}</span>
              <span className="flex-1 text-muted">
                {e.hours.length ? `${e.hours.map(([f, t]) => `${t12(f)}–${t12(t)}`).join(", ")} only` : "Closed"}
                {e.note && ` · ${e.note}`}
              </span>
              <ConfirmDialog
                id={`remove-${e.date}`}
                trigger="Remove"
                title="Remove this exception?"
                text="Your usual weekly hours apply on that day again."
                confirm="Remove"
                danger
                action={removeException}
              >
                <input type="hidden" name="date" value={e.date} />
              </ConfirmDialog>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-muted">
        Next 14 days: <strong className="text-ink">{soon} open times</strong>.{" "}
        <Link href={`/practitioners/${p.id}`} className="link">See your public profile →</Link>
      </p>
    </>
  );
}