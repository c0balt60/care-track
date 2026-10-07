import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlusIcon } from "@/components/icons";
import { Field, Notice, noticeText, PageHeader, param } from "@/components/ui";
import { addDays, dayKey, formatDayKey, formatZone } from "@/lib/dates";
import { getPractitioner, getViewer, slotsFor, today } from "@/lib/mock-data";

const days: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];

/** "13:00" → "1:00 PM" */
const t12 = (hhmm: string) =>
  new Date(`1970-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

const option = "flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft";

export default async function Availability({ searchParams }: PageProps<"/availability">) {
  const viewer = await getViewer();
  const sp = await searchParams;
  if (!viewer) return null;
  if (viewer.role !== "practitioner") notFound();

  const p = getPractitioner(viewer.practitionerId)!;
  const zone = formatZone(new Date(), p.timeZone);
  const soon = slotsFor(p).filter((s) => dayKey(s.start, p.timeZone) < addDays(today(p.timeZone), 14)).length;
  const notice = noticeText(
    { saved: "Changes saved.", added: "Exception added.", removed: "Exception removed." },
    param(sp.notice),
  );

  return (
    <>
      <PageHeader
        title="Availability"
        description={`When patients can book you. Times are in ${zone}.`}
        actions={<button form="availability" className="btn btn-primary">Save changes</button>}
      />
      {notice && <Notice>{notice}</Notice>}

      {/* Prototype: posts back here. The real form calls the team's save action. */}
      <form id="availability" method="post" action="/availability?notice=saved" className="space-y-6">
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
              {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </section>

        <section aria-labelledby="weekly" className="card p-5">
          <h2 id="weekly" className="text-lg font-semibold">Weekly hours</h2>
          <ul className="mt-2 divide-y divide-line">
            {days.map(([d, name]) => {
              const ranges = p.hours[d] ?? [];
              return (
                // Unchecking a day hides its hours with CSS (:has), no JavaScript.
                <li key={d} className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex min-h-11 w-36 items-center gap-3 font-medium">
                    <input type="checkbox" name={`day-${d}`} defaultChecked={ranges.length > 0} className="size-5" />
                    {name}
                  </label>
                  <span className="text-muted group-has-checked:hidden">Unavailable</span>
                  <div className="hidden flex-wrap items-center gap-2 group-has-checked:flex">
                    {(ranges.length ? ranges : [["09:00", "17:00"]]).map(([from, to], i) => (
                      <span key={i} className="flex items-center gap-1">
                        <label htmlFor={`d${d}-${i}-from`} className="sr-only">{name} from</label>
                        <input type="time" id={`d${d}-${i}-from`} name={`d${d}-${i}-from`} defaultValue={from} className="input w-auto" />
                        <span aria-hidden="true">–</span>
                        <label htmlFor={`d${d}-${i}-to`} className="sr-only">{name} until</label>
                        <input type="time" id={`d${d}-${i}-to`} name={`d${d}-${i}-to`} defaultValue={to} className="input w-auto" />
                      </span>
                    ))}
                    <button type="button" className="btn btn-secondary px-3" aria-label={`Add hours on ${name}`}>
                      <PlusIcon />
                    </button>
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
            action="/availability?notice=added"
            method="post"
          >
            <Field label="Date" id="date" type="date" min={today(p.timeZone)} required />
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
            <Field label="Note (optional)" id="note" placeholder="e.g. Holiday" />
          </ConfirmDialog>
        </div>

        <ul className="mt-2 divide-y divide-line">
          {p.exceptions.map((e) => (
            <li key={e.day} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span className="w-36 font-medium">{formatDayKey(addDays(today(p.timeZone), e.day))}</span>
              <span className="flex-1 text-muted">
                {e.hours.length ? `${e.hours.map(([f, t]) => `${t12(f)}–${t12(t)}`).join(", ")} only` : "Closed"} · {e.note}
              </span>
              <ConfirmDialog
                id={`remove-${e.day}`}
                trigger="Remove"
                title="Remove this exception?"
                text="Your usual weekly hours apply on that day again."
                confirm="Remove"
                danger
                action="/availability?notice=removed"
                method="post"
              />
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
