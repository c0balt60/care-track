import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelDialog, RequestActions, statusNote } from "@/components/appointment-card";
import { ArrowLeftIcon } from "@/components/icons";
import { Notice, param, StatusBadge } from "@/components/ui";
import { formatDay, formatWhen } from "@/lib/dates";
import {
  type Appointment, getAppointment, getClinic, getPatient, getPractitioner, getViewer, involves, isUpcoming, previewBooking,
} from "@/lib/mock-data";

export default async function AppointmentDetail({ params, searchParams }: PageProps<"/appointments/[id]">) {
  const viewer = await getViewer();
  const { id } = await params;
  const sp = await searchParams;
  if (!viewer) return null;

  // Prototype: "new_<slotId>" is the appointment the book page just "created",
  // rebuilt from the URL. ?from= is the appointment being rescheduled.
  const from = getAppointment(param(sp.from) ?? "");
  let a: Appointment | undefined = id.startsWith("new_")
    ? previewBooking(id.slice(4), {
        patientId: viewer.role === "patient" ? viewer.patientId : (param(sp.patient) ?? ""),
        reason: param(sp.reason) ?? from?.reason ?? "",
        bookedBy: viewer.role === "staff" ? "staff" : "patient",
      })
    : getAppointment(id);
  if (!a || !involves(viewer, a)) notFound();

  const p = getPractitioner(a.practitionerId)!;
  const tz = p.timeZone;
  const clinic = getClinic(p.clinicId);
  const patient = getPatient(a.patientId);
  if (from) a.history.push({ label: `Moved from ${formatWhen(from.start, tz)}`, at: new Date() });

  // Prototype: show the result of Cancel / Accept / Decline without saving it.
  const notice = param(sp.notice);
  const note = param(sp.note);
  if (notice === "cancelled" || notice === "confirmed" || notice === "declined") {
    a = {
      ...a,
      status: notice,
      ...(notice === "cancelled" && { cancelledBy: viewer.role, cancelReason: note }),
      ...(notice === "declined" && { declineNote: note }),
      history: [...a.history, { label: notice[0].toUpperCase() + notice.slice(1), at: new Date() }],
    };
  }

  const pending = a.status === "pending";
  const banner =
    notice === "cancelled" ? (pending ? "Request withdrawn." : "Appointment cancelled.")
    : notice === "confirmed" ? "Request accepted. The patient will see it's confirmed."
    : notice === "declined" ? "Request declined."
    : !id.startsWith("new_") ? undefined
    : from ? (pending ? `Request sent. You keep your ${formatWhen(from.start, tz)} time until ${p.name} responds.` : "Your appointment has been moved.")
    : viewer.role === "staff" ? `${pending ? "Request sent" : "Booked"} for ${patient.name}.`
    : pending ? `Request sent. We'll update this page when ${p.name} responds.`
    : "You're booked.";

  const upcoming = isUpcoming(a);
  const extra = statusNote(a, viewer);
  const row = "border-t border-line pt-4 sm:border-0 sm:pt-0";

  return (
    <>
      <Link href="/appointments" className="link mb-4 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon width={16} height={16} /> Appointments
      </Link>

      {banner && <Notice>{banner}</Notice>}

      <article className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <time dateTime={a.start.toISOString()}>{formatWhen(a.start, tz)}</time>
            </h1>
            <p className="text-muted">{p.slotMinutes} minutes</p>
          </div>
          <StatusBadge status={a.status} />
        </div>
        {extra && <p className="mt-3 text-muted">{extra}</p>}

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
                {patient.dob && (
                  <span className="block text-sm text-muted">
                    Born {new Date(`${patient.dob}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" })} · {patient.phone}
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
          {a.history.map((h, i) => (
            <li key={i}>{i > 0 && "· "}{h.label} {formatDay(h.at, tz)}</li>
          ))}
        </ol>

        {upcoming && (a.status === "confirmed" || (pending && viewer.role !== "staff")) && (
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {viewer.role === "patient" && a.status === "confirmed" && (
              <Link href={`/practitioners/${p.id}?reschedule=${a.id}`} className="btn btn-secondary">Reschedule</Link>
            )}
            {viewer.role === "practitioner" && pending ? (
              <RequestActions a={a} action={`/appointments/${a.id}`} />
            ) : (
              <CancelDialog a={a} viewer={viewer} />
            )}
          </div>
        )}
      </article>
    </>
  );
}
