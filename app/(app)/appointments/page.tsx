import Link from "next/link";
import { AppointmentCard, RequestActions } from "@/components/appointment-card";
import { CalendarIcon } from "@/components/icons";
import { EmptyState, Notice, PageHeader, param } from "@/components/ui";
import { dayKey, formatDayKey } from "@/lib/dates";
import { type Appointment, appointmentsFor, getPatient, getAppointment, getViewer, isUpcoming, practitioners } from "@/lib/mock-data";

const tabs = {
  upcoming: { label: "Upcoming", empty: "No upcoming appointments", match: (a: Appointment) => a.status === "confirmed" && isUpcoming(a) },
  pending: { label: "Pending", empty: "No pending requests", match: (a: Appointment) => a.status === "pending" },
  past: { label: "Past", empty: "No past appointments", match: (a: Appointment) => a.status === "completed" || (a.status === "confirmed" && !isUpcoming(a)) },
  cancelled: { label: "Cancelled", empty: "Nothing cancelled or declined", match: (a: Appointment) => a.status === "cancelled" || a.status === "declined" },
};
type Tab = keyof typeof tabs;

export default async function Appointments({ searchParams }: PageProps<"/appointments">) {
  const viewer = await getViewer();
  const sp = await searchParams;
  if (!viewer) return null;

  const s = param(sp.status) ?? "";
  const status: Tab = Object.hasOwn(tabs, s) ? (s as Tab) : "upcoming";
  const who = viewer.role === "staff" ? param(sp.practitioner) : undefined;
  const done = param(sp.done);
  const answered = getAppointment(done ?? "");
  const notice = param(sp.notice);

  // Prototype: the answered request is hidden via ?done= since nothing is saved.
  const mine = appointmentsFor(viewer).filter((a) => a.id !== done && (!who || a.practitionerId === who));
  const newestFirst = status === "past" || status === "cancelled";
  const list = mine
    .filter(tabs[status].match)
    .sort((a, b) => (newestFirst ? -1 : 1) * (a.start.getTime() - b.start.getTime()));

  const byDay = new Map<string, Appointment[]>();
  for (const a of list) {
    const d = dayKey(a.start, "America/New_York");
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const keep = who ? `&practitioner=${who}` : "";

  return (
    <>
      <PageHeader title="Appointments" />

      {answered && (notice === "confirmed" || notice === "declined") && (
        <Notice>{notice === "confirmed" ? "Accepted" : "Declined"} {getPatient(answered.patientId).name}’s request.</Notice>
      )}

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
                  <span className="rounded-full bg-sand px-1.5 text-xs text-ink">{mine.filter(t.match).length}</span>
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
                {practitioners.filter((p) => p.clinicId === viewer.clinicId).map((p) => (
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
          {[...byDay].map(([day, appts]) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="mb-3 text-sm font-semibold text-muted">
                <time dateTime={day}>{formatDayKey(day)}</time>
              </h2>
              <ul className="space-y-3">
                {appts.map((a) => (
                  <li key={a.id}>
                    <AppointmentCard a={a} viewer={viewer}>
                      {viewer.role === "practitioner" && a.status === "pending" && (
                        <RequestActions a={a} action="/appointments" hidden={{ status: "pending" }} />
                      )}
                    </AppointmentCard>
                  </li>
                ))}
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
