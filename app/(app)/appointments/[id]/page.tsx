import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelButton, RequestButtons } from "@/components/appointment-actions";
import { ArrowLeftIcon } from "@/components/icons";
import { Notice, param, StatusBadge } from "@/components/ui";
import { allowedActions, cancelReasonRequired } from "@/lib/appointment-rules";
import { appointmentErrors, loadAppointmentFor, type AppointmentError } from "@/lib/appointments";
import { audit } from "@/lib/audit";
import { requireRole, type ReadyViewer } from "@/lib/auth";
import { formatDay, formatWhen } from "@/lib/dates";
import { approveAppointment, cancelAppointment, declineAppointment } from "./actions";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadAppointmentFor>>>;
type Role = "patient" | "practitioner" | "staff";

const notices: Record<string, string> = {
  confirmed: "Request accepted. The patient will see it's confirmed.",
  declined: "Request declined.",
  cancelled: "Appointment cancelled.",
  withdrawn: "Request withdrawn.",
  moved: "Your appointment has been moved.",
  move_requested: "Request sent. You keep your current time until it's accepted.",
};

export default async function AppointmentDetail({ params, searchParams }: PageProps<"/appointments/[id]">) {
  const viewer = await requireRole("patient", "practitioner", "staff");
  const { id } = await params;
  const sp = await searchParams;

  // ponytail: the dashboards and /appointments list still link mock ids ("a1"),
  // which aren't uuids and 404 here until SCH-7 (#25) moves them to the DB.
  const found = await loadAppointmentFor(viewer, id);
  if (!found) notFound();
  const { appointment: a, practitioner: p, clinic, patient, events, movedFrom, movedTo } = found;

  // The clinic side sees the patient's date of birth and phone below, so record who looked.
  if (viewer.role !== "patient") await audit(viewer.userId, "patient.view", "patients", patient.id);

  const tz = p.timeZone;
  const when = formatWhen(a.startsAt, tz);
  const actions = allowedActions(viewer, { ...a, clinicId: p.clinicId });
  const pending = a.status === "pending";

  const noticeKey = param(sp.notice);
  const notice = noticeKey && Object.hasOwn(notices, noticeKey) ? notices[noticeKey] : null;
  const errorKey = param(sp.error);
  const error = errorKey && Object.hasOwn(appointmentErrors, errorKey) ? appointmentErrors[errorKey as AppointmentError] : null;

  const extra = statusLine(found, viewer);
  const row = "border-t border-line pt-4 sm:border-0 sm:pt-0";

  return (
    <>
      <Link href="/appointments" className="link mb-4 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon width={16} height={16} /> Appointments
      </Link>

      {notice && <Notice>{notice}</Notice>}
      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <article className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <time dateTime={a.startsAt.toISOString()}>{when}</time>
            </h1>
            <p className="text-muted">{Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)} minutes</p>
          </div>
          <StatusBadge status={a.status} />
        </div>
        {extra && <p className="mt-3 text-muted">{extra}</p>}
        {movedFrom && (
          <p className="mt-3 text-muted">
            {a.status === "pending" ? "Would replace " : "Moved from "}
            <Link href={`/appointments/${movedFrom.id}`} className="link">{formatWhen(movedFrom.startsAt, tz)}</Link>
          </p>
        )}
        {movedTo && (
          <p className="mt-3 text-muted">
            {movedTo.status === "pending" ? "Move requested to " : "Moved to "}
            <Link href={`/appointments/${movedTo.id}`} className="link">{formatWhen(movedTo.startsAt, tz)}</Link>
          </p>
        )}

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className={row}>
            <dt className="text-sm text-muted">Practitioner</dt>
            <dd><Link href={`/practitioners/${p.id}`} className="link">{p.name}</Link>, {p.specialty}</dd>
          </div>
          {viewer.role !== "patient" && (
            <div className={row}>
              <dt className="text-sm text-muted">Patient</dt>
              <dd>
                {patient.name}
                {(patient.dob || patient.phone) && (
                  <span className="block text-sm text-muted">
                    {[
                      patient.dob &&
                        `Born ${new Date(`${patient.dob}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" })}`,
                      patient.phone,
                    ].filter(Boolean).join(" · ")}
                  </span>
                )}
              </dd>
            </div>
          )}
          <div className={row}>
            <dt className="text-sm text-muted">Where</dt>
            <dd>{clinic ? <>{clinic.name}<span className="block text-sm text-muted">{clinic.address}, {clinic.city}</span></> : p.city}</dd>
          </div>
          <div className={row}>
            <dt className="text-sm text-muted">Reason for visit</dt>
            <dd>{a.reason || "Not given"}</dd>
          </div>
          <div className={row}>
            <dt className="text-sm text-muted">Booked by</dt>
            <dd>{a.bookedBy === "staff" ? "Front desk" : "Patient"}</dd>
          </div>
        </dl>

        <h2 className="mt-6 text-sm font-semibold">History</h2>
        <ol className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
          {events.map((e, i) => (
            <li key={e.id}>{i > 0 && "· "}{eventLabel(e)} {formatDay(e.at, tz)}</li>
          ))}
        </ol>

        {actions.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {/* Hidden while a move request is waiting: bookSlot() allows one at a time. */}
            {actions.includes("reschedule") && !movedTo && (
              <Link href={`/practitioners/${p.id}?reschedule=${a.id}`} className="btn btn-secondary">Reschedule</Link>
            )}
            {actions.includes("approve") && (
              <RequestButtons
                id={a.id}
                summary={`${patient.name} asked for ${when}.`}
                approveAction={approveAppointment.bind(null, a.id)}
                declineAction={declineAppointment.bind(null, a.id)}
              />
            )}
            {actions.includes("cancel") && (
              <CancelButton
                id={a.id}
                summary={`${when} with ${viewer.role === "patient" ? p.name : patient.name}.`}
                pending={pending}
                reasonRequired={cancelReasonRequired(viewer)}
                otherParty={patient.name}
                action={cancelAppointment.bind(null, a.id)}
              />
            )}
          </div>
        )}
      </article>
    </>
  );
}

/**
 * Who acted, from this viewer's point of view: "you", or a name.
 * "You" means the same person, not the same role: a clinic has several staff, so
 * a colleague's cancellation must not read as yours. An appointment has only one
 * patient and one practitioner, so for those roles the role is enough (and covers
 * events with no recorded user, like seeded history).
 */
function who(role: Role, actorUserId: string | null, viewer: ReadyViewer, { practitioner: p, clinic, patient }: Loaded) {
  if (actorUserId === viewer.userId || (role === viewer.role && role !== "staff")) return "you";
  switch (role) {
    case "patient": return patient.name;
    case "practitioner": return p.name;
    case "staff": return clinic?.name ?? "the front desk";
  }
}

/** One entry of the History list. */
function eventLabel(e: Loaded["events"][number]) {
  switch (e.type) {
    case "booked": return e.actorRole === "staff" ? "Booked by the front desk" : "Booked";
    // A confirmation with no actor is instant mode confirming at booking time.
    case "confirmed": return e.actorRole ? "Confirmed" : "Confirmed automatically";
    case "declined": return "Declined";
    case "cancelled": return e.actorRole === "patient" ? "Cancelled by the patient" : "Cancelled by the clinic";
    case "completed": return "Completed";
    case "rescheduled": return "Moved to a new time";
  }
}

/** The extra line under the badge: who we're waiting on, who cancelled, the decline note. */
function statusLine(found: Loaded, viewer: ReadyViewer) {
  const { appointment: a, practitioner: p } = found;
  if (a.status === "pending" && viewer.role === "patient") return `Waiting for ${p.name} to confirm`;
  if (a.status === "declined") return a.declineNote ?? undefined;
  // The "Moved to ..." line already explains a rescheduled cancellation.
  if (a.status === "cancelled" && found.movedTo) return undefined;
  if (a.status === "cancelled") {
    const cancelEvent = found.events.findLast((e) => e.type === "cancelled");
    const by = a.cancelledBy ? who(a.cancelledBy, cancelEvent?.actorUserId ?? null, viewer, found) : "the clinic";
    return `Cancelled by ${by}${a.cancelReason ? `: "${a.cancelReason}"` : ""}`;
  }
}
