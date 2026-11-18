import Link from "next/link";
import { CancelButton } from "@/components/appointment-actions";
import { AppointmentCard } from "@/components/appointment-card";
import { CalendarIcon, SearchIcon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { cancelAppointment } from "@/app/(app)/appointments/[id]/actions";
import { listAppointmentsFor } from "@/lib/appointment-lists";
import { allowedActions, cancelReasonRequired } from "@/lib/appointment-rules";
import type { ReadyViewer } from "@/lib/auth";
import { formatWhen } from "@/lib/dates";

export default async function PatientHome({ viewer }: { viewer: ReadyViewer<"patient"> }) {
    const now = new Date();
    // Live appointments that haven't ended yet (one in progress still counts).
    const upcoming = (await listAppointmentsFor(viewer, { statuses: ["pending", "confirmed"] }))
        .filter((r) => r.appointment.endsAt.getTime() > now.getTime());
    const [next, ...later] = upcoming.filter((r) => r.appointment.status === "confirmed");
    const pending = upcoming.filter((r) => r.appointment.status === "pending");

    const find = (
        <Link href="/search" className="btn btn-primary">
            <SearchIcon /> Find an appointment
        </Link>
    );

    let nextActions = null;
    if (next) {
        const { appointment: a, practitioner: p } = next;
        const actions = allowedActions(viewer, { ...a, clinicId: p.clinicId }, now);
        // A waiting move request for this appointment is one of the pending rows.
        // Only one is allowed at a time (see bookSlot), so hide Reschedule meanwhile,
        // like the detail page does.
        const moveWaiting = pending.some((r) => r.appointment.rescheduledFromId === a.id);
        nextActions = (
            <>
                {/* ponytail: the practitioner page still uses mock slots, so this stops at "isn't available" until SCH-3 (#21). */}
                {actions.includes("reschedule") && !moveWaiting && (
                    <Link href={`/practitioners/${p.id}?reschedule=${a.id}`} className="btn btn-secondary">
                        Reschedule
                    </Link>
                )}
                {actions.includes("cancel") && (
                    <CancelButton
                        id={a.id}
                        summary={`${formatWhen(a.startsAt, p.timeZone)} with ${p.name}.`}
                        pending={false}
                        reasonRequired={cancelReasonRequired(viewer)}
                        otherParty={p.name}
                        action={cancelAppointment.bind(null, a.id)}
                    />
                )}
            </>
        );
    }

    return (
        <>
            <PageHeader title={`Hi, ${viewer.name.split(" ")[0]}`} actions={next && find} />

            {!next && !pending.length ? (
                <EmptyState icon={<CalendarIcon />} title="No appointments yet" text="Find an open time with a practitioner near you." action={find} />
            ) : (
                <div className="space-y-8">
                    {next && (
                        <section aria-labelledby="next">
                            <h2 id="next" className="mb-3 text-lg font-semibold">Next appointment</h2>
                            <AppointmentCard row={next} viewer={viewer}>{nextActions}</AppointmentCard>
                        </section>
                    )}

                    {pending.length > 0 && (
                        <section aria-labelledby="pending">
                            <h2 id="pending" className="mb-3 text-lg font-semibold">Waiting for confirmation ({pending.length})</h2>
                            <ul className="space-y-3">
                                {pending.map((r) => <li key={r.appointment.id}><AppointmentCard row={r} viewer={viewer} /></li>)}
                            </ul>
                        </section>
                    )}

                    {later.length > 0 && (
                        <section aria-labelledby="later">
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 id="later" className="text-lg font-semibold">Upcoming ({later.length})</h2>
                                <Link href="/appointments" className="link text-sm">View all →</Link>
                            </div>
                            <ul className="space-y-3">
                                {later.map((r) => <li key={r.appointment.id}><AppointmentCard row={r} viewer={viewer} /></li>)}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </>
    );
}
