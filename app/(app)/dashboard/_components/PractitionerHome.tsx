import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestButtons } from "@/components/appointment-actions";
import { AppointmentCard } from "@/components/appointment-card";
import { PageHeader, StatusBadge } from "@/components/ui";
import { approveAppointment, declineAppointment } from "@/app/(app)/appointments/[id]/actions";
import { listAppointmentsFor, practitionerById } from "@/lib/appointment-lists";
import { allowedActions } from "@/lib/appointment-rules";
import type { ReadyViewer } from "@/lib/auth";
import { addDays, dayKey, formatDayKey, formatTime, formatWhen, zoned } from "@/lib/dates";
import StatCard from "./StatCard";

export default async function PractitionerHome({ viewer }: { viewer: ReadyViewer<"practitioner"> }) {
    const p = await practitionerById(viewer.practitionerId);
    // The session found this profile a moment ago; it can only vanish if deleted meanwhile.
    if (!p) notFound();

    const now = new Date();
    const tz = p.timeZone;
    const day = dayKey(now, tz);

    const [agenda, requests] = await Promise.all([
        // Today, midnight to midnight on the practitioner's own clock. Booked means
        // accepted: requests wait in "Needs your response" until they're answered.
        listAppointmentsFor(viewer, {
            from: zoned(day, 0, tz),
            to: zoned(addDays(day, 1), 0, tz),
            statuses: ["confirmed", "completed"],
        }),
        // Requests that can still be answered: the rules refuse once the time has started.
        listAppointmentsFor(viewer, { from: now, statuses: ["pending"] }),
    ]);
    // In instant mode no new requests arrive, but some can be left from before a switch.
    const showRequests = p.bookingMode === "approval" || requests.length > 0;

    return (
        <>
            <PageHeader
                title={`Today · ${formatDayKey(day)}`}
                actions={<Link href="/availability" className="btn btn-secondary">Edit hours</Link>}
            />

            {/* ponytail: "Next opening" needs real open slots and returns with SCH-3 (#21). */}
            <div className="grid gap-4 sm:grid-cols-2">
                <StatCard title="Booked today" value={String(agenda.length)} />
                <StatCard
                    title="To review"
                    value={showRequests ? String(requests.length) : "–"}
                    description={showRequests ? undefined : "Bookings confirm instantly"}
                />
            </div>

            {showRequests && (
                <section aria-labelledby="respond" className="mt-8">
                    <h2 id="respond" className="mb-3 text-lg font-semibold">Needs your response</h2>
                    {requests.length ? (
                        <ul className="space-y-3">
                            {requests.map((r) => {
                                const a = r.appointment;
                                const canAnswer = allowedActions(viewer, { ...a, clinicId: r.practitioner.clinicId }, now).includes("approve");
                                return (
                                    <li key={a.id}>
                                        <AppointmentCard row={r} viewer={viewer}>
                                            {canAnswer && (
                                                <RequestButtons
                                                    id={a.id}
                                                    summary={`${r.patient.name} asked for ${formatWhen(a.startsAt, tz)}.`}
                                                    approveAction={approveAppointment.bind(null, a.id)}
                                                    declineAction={declineAppointment.bind(null, a.id)}
                                                />
                                            )}
                                        </AppointmentCard>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="card p-4 text-muted">You’re all caught up.</p>
                    )}
                </section>
            )}

            <section aria-labelledby="agenda" className="mt-8">
                <h2 id="agenda" className="mb-3 text-lg font-semibold">Today’s agenda</h2>
                {/* ponytail: booked appointments only; open times between them return with SCH-3 (#21). */}
                {agenda.length ? (
                    <ol className="card divide-y divide-line">
                        {agenda.map(({ appointment: a, patient }) => (
                            <li key={a.id} className="flex min-h-14 items-center gap-4 px-4 py-2">
                                <time dateTime={a.startsAt.toISOString()} className="w-20 shrink-0 font-medium tabular-nums">
                                    {formatTime(a.startsAt, tz)}
                                </time>
                                <div className="min-w-0 flex-1">
                                    <Link href={`/appointments/${a.id}`} className="font-medium hover:underline">
                                        {patient.name}
                                    </Link>
                                    <p className="truncate text-sm text-muted">{a.reason}</p>
                                </div>
                                <StatusBadge status={a.status} />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="card p-4 text-muted">Nothing booked today.</p>
                )}
            </section>
        </>
    );
}
