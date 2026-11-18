import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/ui";
import { clinicById, listAppointmentsFor, practitionersAt, type ListedAppointment } from "@/lib/appointment-lists";
import type { ReadyViewer } from "@/lib/auth";
import { addDays, dayKey, formatDayKey, formatTime, zoned } from "@/lib/dates";

export default async function StaffHome({ viewer }: { viewer: ReadyViewer<"staff"> }) {
    const clinic = await clinicById(viewer.clinicId);
    // The session found this clinic a moment ago; it can only vanish if deleted meanwhile.
    if (!clinic) notFound();

    const tz = clinic.timeZone;
    const day = dayKey(new Date(), tz);
    const [team, today] = await Promise.all([
        practitionersAt(clinic.id),
        // Today on the clinic's clock, for everyone at the clinic, in one query.
        // Booked means accepted: pending requests are on /appointments?status=pending.
        listAppointmentsFor(viewer, {
            from: zoned(day, 0, tz),
            to: zoned(addDays(day, 1), 0, tz),
            statuses: ["confirmed", "completed"],
        }),
    ]);
    const byPractitioner = Map.groupBy(today, (r: ListedAppointment) => r.practitioner.id);

    return (
        <>
            <PageHeader
                title={`${clinic.name} · Today`}
                description={formatDayKey(day)}
                actions={<Link href="/clinic/book" className="btn btn-primary">Book for a patient</Link>}
            />

            {/* ponytail: booked appointments only; open times and "Off today" return with SCH-3 (#21). */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {team.map((p) => {
                    const rows = byPractitioner.get(p.id) ?? [];
                    return (
                        <section key={p.id} aria-labelledby={`col-${p.id}`} className="card self-start">
                            <h2 id={`col-${p.id}`} className="border-b border-line px-4 py-3 font-semibold">
                                {p.name}
                                <span className="block text-sm font-normal text-muted">{p.specialty}</span>
                            </h2>
                            {rows.length ? (
                                <ol className="divide-y divide-line">
                                    {rows.map(({ appointment: a, patient }) => (
                                        <li key={a.id} className="flex min-h-11 items-center gap-3 px-4">
                                            <time dateTime={a.startsAt.toISOString()} className="w-18 shrink-0 text-sm font-medium tabular-nums">
                                                {formatTime(a.startsAt, p.timeZone)}
                                            </time>
                                            <Link href={`/appointments/${a.id}`} className="min-w-0 flex-1 truncate py-2 hover:underline">
                                                {patient.name}
                                            </Link>
                                            {a.status !== "confirmed" && <StatusBadge status={a.status} />}
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="px-4 py-6 text-muted">Nothing booked today.</p>
                            )}
                        </section>
                    );
                })}
            </div>
        </>
    );
}
