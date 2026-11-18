import Link from "next/link";
import { RequestButtons } from "@/components/appointment-actions";
import { AppointmentCard } from "@/components/appointment-card";
import { CalendarIcon } from "@/components/icons";
import { EmptyState, PageHeader, param } from "@/components/ui";
import { listAppointmentsFor, practitionersAt, type ListedAppointment } from "@/lib/appointment-lists";
import { allowedActions } from "@/lib/appointment-rules";
import { requireRole } from "@/lib/auth";
import { dayKey, formatDayKey, formatWhen } from "@/lib/dates";
import { approveAppointment, declineAppointment } from "./[id]/actions";

type Match = (row: ListedAppointment, now: Date) => boolean;
const ended = ({ appointment: a }: ListedAppointment, now: Date) => a.endsAt.getTime() <= now.getTime();

const tabs: Record<string, { label: string; empty: string; match: Match }> = {
  upcoming: { label: "Upcoming", empty: "No upcoming appointments", match: (r, now) => r.appointment.status === "confirmed" && !ended(r, now) },
  pending: { label: "Pending", empty: "No pending requests", match: (r) => r.appointment.status === "pending" },
  past: { label: "Past", empty: "No past appointments", match: (r, now) => r.appointment.status === "completed" || (r.appointment.status === "confirmed" && ended(r, now)) },
  cancelled: { label: "Cancelled", empty: "Nothing cancelled or declined", match: (r) => r.appointment.status === "cancelled" || r.appointment.status === "declined" },
};

export default async function Appointments({ searchParams }: PageProps<"/appointments">) {
  const viewer = await requireRole("patient", "practitioner", "staff");
  const sp = await searchParams;
  const now = new Date();

  const s = param(sp.status) ?? "";
  const status = Object.hasOwn(tabs, s) ? s : "upcoming";

  // Staff can narrow to one practitioner. Only an id from their own clinic's list
  // is used, so whatever is in the URL never reaches the query unchecked.
  const team = viewer.role === "staff" ? await practitionersAt(viewer.clinicId) : [];
  const who = team.find((p) => p.id === param(sp.practitioner))?.id;

  // Every tab's count needs every row, so load them all once and split here.
  // ponytail: no paging yet; the Past tab grows without limit over the years.
  const mine = await listAppointmentsFor(viewer, { practitionerId: who });
  const newestFirst = status === "past" || status === "cancelled";
  const list = mine.filter((r) => tabs[status].match(r, now));
  if (newestFirst) list.reverse();

  // Grouped by day in the practitioner's zone, the same zone the card shows the time in.
  const byDay = new Map<string, ListedAppointment[]>();
  for (const r of list) {
    const d = dayKey(r.appointment.startsAt, r.practitioner.timeZone);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const keep = who ? `&practitioner=${who}` : "";

  return (
    <>
      <PageHeader title="Appointments" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1 border-b border-line">
            {Object.entries(tabs).map(([key, t]) => (
              <li key={key}>
                <Link
                  href={`/appointments?status=${key}${keep}`}
                  aria-current={key === status ? "page" : undefined}
                  className="-mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink"
                >
                  {t.label}
                  <span className="rounded-full bg-sand px-1.5 text-xs text-ink">{mine.filter((r) => t.match(r, now)).length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {viewer.role === "staff" && (
          <form className="flex items-end gap-2">
            <input type="hidden" name="status" value={status} />
            <div>
              <label htmlFor="practitioner" className="label">Practitioner</label>
              <select id="practitioner" name="practitioner" defaultValue={who ?? ""} className="input">
                <option value="">Everyone</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary">Filter</button>
          </form>
        )}
      </div>

      {list.length ? (
        <div className="space-y-8">
          {[...byDay].map(([day, rows]) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="mb-3 text-sm font-semibold text-muted">
                <time dateTime={day}>{formatDayKey(day)}</time>
              </h2>
              <ul className="space-y-3">
                {rows.map((r) => {
                  const { appointment: a, practitioner: p } = r;
                  // The same rules the detail page and the server actions use.
                  const canAnswer = allowedActions(viewer, { ...a, clinicId: p.clinicId }, now).includes("approve");
                  return (
                    <li key={a.id}>
                      <AppointmentCard row={r} viewer={viewer}>
                        {canAnswer && (
                          <RequestButtons
                            id={a.id}
                            summary={`${r.patient.name} asked for ${formatWhen(a.startsAt, p.timeZone)}.`}
                            approveAction={approveAppointment.bind(null, a.id)}
                            declineAction={declineAppointment.bind(null, a.id)}
                          />
                        )}
                      </AppointmentCard>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarIcon />}
          title={tabs[status].empty}
          text={viewer.role === "patient" ? "When you book, your appointments show up here." : "Appointments show up here as patients book."}
          action={viewer.role === "patient" && <Link href="/search" className="btn btn-primary">Find an appointment</Link>}
        />
      )}
    </>
  );
}
