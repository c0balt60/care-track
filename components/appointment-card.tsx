import Link from "next/link";
import type { ReactNode } from "react";
import type { ListedAppointment } from "@/lib/appointment-lists";
import type { ReadyViewer } from "@/lib/auth";
import { formatWhen } from "@/lib/dates";
import { StatusBadge } from "./ui";

type CardViewer = ReadyViewer<"patient" | "practitioner" | "staff">;

/**
 * The extra line under the badge: who we're waiting on, who cancelled, the decline note.
 * Same wording as statusLine() on the detail page, from the columns a list row has.
 */
function statusNote({ appointment: a, practitioner: p, patient, clinic }: ListedAppointment, viewer: CardViewer) {
  if (a.status === "pending" && viewer.role === "patient") return `Waiting for ${p.name} to confirm`;
  if (a.status === "declined") return a.declineNote ?? undefined;
  if (a.status === "cancelled" && a.cancelledBy) {
    // A list row has no history, so "you" goes by role. Staff never get "you":
    // the clinic has several staff, and a colleague's cancellation isn't yours.
    // The detail page tells them apart by user.
    const by =
      a.cancelledBy === viewer.role && viewer.role !== "staff" ? "you"
      : a.cancelledBy === "patient" ? patient.name
      : a.cancelledBy === "practitioner" ? p.name
      : (clinic?.name ?? "the front desk");
    return `Cancelled by ${by}${a.cancelReason ? `: "${a.cancelReason}"` : ""}`;
  }
}

/** The whole card links to the appointment. Put action buttons in `children`. */
export function AppointmentCard({ row, viewer, children }: { row: ListedAppointment; viewer: CardViewer; children?: ReactNode }) {
  const { appointment: a, practitioner: p, clinic, patient } = row;
  const note = statusNote(row, viewer);

  return (
    <article className="card card-link p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link href={`/appointments/${a.id}`} className="after:absolute after:inset-0 after:rounded-xl">
              <time dateTime={a.startsAt.toISOString()}>{formatWhen(a.startsAt, p.timeZone)}</time>
            </Link>
          </h3>
          <p className="mt-0.5">
            {viewer.role === "patient" ? `${p.name} · ${p.specialty}`
              : viewer.role === "practitioner" ? patient.name
              : `${patient.name} with ${p.name}`}
          </p>
          <p className="text-sm text-muted">
            {viewer.role === "patient" ? (clinic ? `${clinic.name}, ${clinic.city}` : p.city) : a.reason ? `“${a.reason}”` : "No reason given"}
          </p>
          {note && <p className="mt-1 text-sm text-muted">{note}</p>}
        </div>
        <StatusBadge status={a.status} />
      </div>
      {children && <div className="relative z-10 mt-3 flex flex-wrap justify-end gap-2">{children}</div>}
    </article>
  );
}
