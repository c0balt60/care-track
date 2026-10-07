import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { formatDayKey, formatTime, weekday } from "@/lib/dates";
import { agendaFor, getClinic, getPatient, practitioners, today, type Viewer } from "@/lib/mock-data";

export default function StaffHome({ viewer }: { viewer: Extract<Viewer, { role: "staff" }> }) {
    const clinic = getClinic(viewer.clinicId)!;
    const day = today(clinic.timeZone);
    const team = practitioners.filter((p) => p.clinicId === clinic.id);

    return (
        <>
            <PageHeader
                title={`${clinic.name} · Today`}
                description={formatDayKey(day)}
                actions={<Link href="/clinic/book" className="btn btn-primary">Book for a patient</Link>}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {team.map((p) => {
                    const rows = agendaFor(p, day);
                    const worksToday = !!(p.exceptions.find((e) => e.day === 0)?.hours ?? p.hours[weekday(day)])?.length;
                    return (
                        <section key={p.id} aria-labelledby={`col-${p.id}`} className="card self-start">
                            <h2 id={`col-${p.id}`} className="border-b border-line px-4 py-3 font-semibold">
                                {p.name}
                                <span className="block text-sm font-normal text-muted">{p.specialty}</span>
                            </h2>
                            {rows.length ? (
                                <ol className="divide-y divide-line">
                                    {rows.map((row) => (
                                        <li key={row.start.getTime()} className="flex min-h-11 items-center gap-3 px-4">
                                            <time dateTime={row.start.toISOString()} className="w-18 shrink-0 text-sm font-medium tabular-nums">
                                                {formatTime(row.start, p.timeZone)}
                                            </time>
                                            {row.appointment ? (
                                                <Link href={`/appointments/${row.appointment.id}`} className="truncate py-2 hover:underline">
                                                    {getPatient(row.appointment.patientId).name}
                                                </Link>
                                            ) : (
                                                <Link href={`/book/${row.slot!.id}`} className="flex flex-1 items-center justify-between self-stretch text-muted hover:text-accent">
                                                    Open <span className="text-sm font-medium text-accent">Book</span>
                                                </Link>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="px-4 py-6 text-muted">{worksToday ? "No more open times today." : "Off today"}</p>
                            )}
                        </section>
                    );
                })}
            </div>
        </>
    );
}
