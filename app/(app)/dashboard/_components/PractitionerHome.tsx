import Link from "next/link";
import { AppointmentCard, RequestActions } from "@/components/appointment-card";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { formatDay, formatDayKey, formatTime, formatWhen } from "@/lib/dates";
import { agendaFor, appointmentsFor, getAppointment, getPatient, getPractitioner, slotsFor, today, type Viewer } from "@/lib/mock-data";
import StatCard from "./StatCard";

export default function PractitionerHome({ viewer, done, notice }: {
    viewer: Extract<Viewer, { role: "practitioner" }>;
    done?: string;
    notice?: string;
}) {
    const p = getPractitioner(viewer.practitionerId)!;
    const tz = p.timeZone;
    const day = today(tz);
    const agenda = agendaFor(p, day);
    // Prototype: the answered request is hidden via ?done= since nothing is saved.
    const pending = appointmentsFor(viewer)
        .filter((a) => a.status === "pending" && a.id !== done)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
    const nextOpen = slotsFor(p)[0];
    const answered = getAppointment(done ?? "");

    return (
        <>
            <PageHeader
                title={`Today · ${formatDayKey(day)}`}
                actions={<Link href="/availability" className="btn btn-secondary">Edit hours</Link>}
            />

            {answered && (notice === "confirmed" || notice === "declined") && (
                <Notice>
                    {notice === "confirmed" ? "Accepted" : "Declined"} {getPatient(answered.patientId).name}’s request for{" "}
                    {formatWhen(answered.start, tz)}.
                </Notice>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard title="Booked today" value={String(agenda.filter((r) => r.appointment).length)} />
                <StatCard title="To review" value={p.bookingMode === "approval" ? String(pending.length) : "–"} description={p.bookingMode === "instant" ? "Bookings confirm instantly" : undefined} />
                <StatCard
                    title="Next opening"
                    value={nextOpen ? formatTime(nextOpen.start, tz) : "None"}
                    description={nextOpen && formatDay(nextOpen.start, tz)}
                />
            </div>

            {p.bookingMode === "approval" && (
                <section aria-labelledby="respond" className="mt-8">
                    <h2 id="respond" className="mb-3 text-lg font-semibold">Needs your response</h2>
                    {pending.length ? (
                        <ul className="space-y-3">
                            {pending.map((a) => (
                                <li key={a.id}>
                                    <AppointmentCard a={a} viewer={viewer}>
                                        <RequestActions a={a} action="/dashboard" />
                                    </AppointmentCard>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="card p-4 text-muted">You’re all caught up.</p>
                    )}
                </section>
            )}

            <section aria-labelledby="agenda" className="mt-8">
                <h2 id="agenda" className="mb-3 text-lg font-semibold">Today’s agenda</h2>
                {agenda.length ? (
                    <ol className="card divide-y divide-line">
                        {agenda.map((row) => (
                            <li key={row.start.getTime()} className="flex min-h-14 items-center gap-4 px-4 py-2">
                                <time dateTime={row.start.toISOString()} className="w-20 shrink-0 font-medium tabular-nums">
                                    {formatTime(row.start, tz)}
                                </time>
                                {row.appointment ? (
                                    <>
                                        <div className="min-w-0 flex-1">
                                            <Link href={`/appointments/${row.appointment.id}`} className="font-medium hover:underline">
                                                {getPatient(row.appointment.patientId).name}
                                            </Link>
                                            <p className="truncate text-sm text-muted">{row.appointment.reason}</p>
                                        </div>
                                        <StatusBadge status={row.appointment.status} />
                                    </>
                                ) : (
                                    <span className="text-muted">Open</span>
                                )}
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="card p-4 text-muted">Nothing booked and no open times today.</p>
                )}
            </section>
        </>
    );
}
