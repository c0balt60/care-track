import Link from "next/link";
import type { ReactNode } from "react";
import { formatWhen } from "@/lib/dates";
import { type Appointment, getClinic, getPatient, getPractitioner, type Viewer } from "@/lib/mock-data";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./ui";

/** The extra line under the badge: who we're waiting on, who cancelled, the decline note. */
export function statusNote(a: Appointment, viewer: Viewer): string | undefined {
  const p = getPractitioner(a.practitionerId)!;
  // Practitioners see Accept / Decline instead.
  if (a.status === "pending" && viewer.role !== "practitioner") return `Waiting for ${p.name} to confirm`;
  if (a.status === "declined") return a.declineNote;
  if (a.status === "cancelled") {
    const by =
      a.cancelledBy === viewer.role ? "you"
      : a.cancelledBy === "patient" ? getPatient(a.patientId).name
      : a.cancelledBy === "practitioner" ? p.name
      : (getClinic(p.clinicId)?.name ?? "the front desk");
    return `Cancelled by ${by}${a.cancelReason ? `: "${a.cancelReason}"` : ""}`;
  }
}

/** Cancel (or withdraw, while pending). The reason is required for practitioners and staff. */
export function CancelDialog({ a, viewer }: { a: Appointment; viewer: Viewer }) {
  const p = getPractitioner(a.practitionerId)!;
  const withdraw = a.status === "pending";
  const required = viewer.role !== "patient";
  const other = viewer.role === "patient" ? p.name : getPatient(a.patientId).name;

  return (
    <ConfirmDialog
      id={`cancel-${a.id}`}
      trigger={withdraw ? "Withdraw request" : "Cancel appointment"}
      title={withdraw ? "Withdraw this request?" : "Cancel this appointment?"}
      text={`${formatWhen(a.start, p.timeZone)} with ${other}.`}
      confirm={withdraw ? "Withdraw request" : "Cancel appointment"}
      cancel={withdraw ? "Keep request" : "Keep appointment"}
      danger
      action={`/appointments/${a.id}`}
      hidden={{ notice: "cancelled" }}
    >
      <div>
        <label htmlFor={`reason-${a.id}`} className="label">Reason{required ? "" : " (optional)"}</label>
        <textarea id={`reason-${a.id}`} name="note" rows={3} required={required} className="input" />
        {required && <p className="mt-1 text-sm text-muted">{other} will see this.</p>}
      </div>
    </ConfirmDialog>
  );
}

/** Accept and Decline for a pending request. Both go to `action` with ?done=&notice=. */
export function RequestActions({ a, action, hidden = {} }: { a: Appointment; action: string; hidden?: Record<string, string> }) {
  const p = getPractitioner(a.practitionerId)!;
  const fields = (notice: string) => ({ ...hidden, done: a.id, notice });

  return (
    <>
      <ConfirmDialog
        id={`decline-${a.id}`}
        trigger="Decline"
        title="Decline this request?"
        text={`${getPatient(a.patientId).name} asked for ${formatWhen(a.start, p.timeZone)}.`}
        confirm="Decline request"
        cancel="Go back"
        danger
        action={action}
        hidden={fields("declined")}
      >
        <div>
          <label htmlFor={`note-${a.id}`} className="label">Note to the patient (optional)</label>
          <textarea id={`note-${a.id}`} name="note" rows={3} className="input" />
        </div>
      </ConfirmDialog>
      <form action={action}>
        {Object.entries(fields("confirmed")).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button className="btn btn-primary">Accept</button>
      </form>
    </>
  );
}

/** The whole card links to the appointment. Put action buttons in `children`. */
export function AppointmentCard({ a, viewer, children }: { a: Appointment; viewer: Viewer; children?: ReactNode }) {
  const p = getPractitioner(a.practitionerId)!;
  const clinic = getClinic(p.clinicId);
  const patient = getPatient(a.patientId);
  const note = statusNote(a, viewer);

  return (
    <article className="card card-link p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link href={`/appointments/${a.id}`} className="after:absolute after:inset-0 after:rounded-xl">
              <time dateTime={a.start.toISOString()}>{formatWhen(a.start, p.timeZone)}</time>
            </Link>
          </h3>
          <p className="mt-0.5">
            {viewer.role === "patient" ? `${p.name} · ${p.specialty}`
              : viewer.role === "practitioner" ? patient.name
              : `${patient.name} with ${p.name}`}
          </p>
          <p className="text-sm text-muted">
            {viewer.role === "patient" ? (clinic ? `${clinic.name}, ${clinic.city}` : p.city) : `“${a.reason}”`}
          </p>
          {note && <p className="mt-1 text-sm text-muted">{note}</p>}
        </div>
        <StatusBadge status={a.status} />
      </div>
      {children && <div className="relative z-10 mt-3 flex flex-wrap justify-end gap-2">{children}</div>}
    </article>
  );
}
