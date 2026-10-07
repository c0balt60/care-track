import Link from "next/link";
import { AppointmentCard, CancelDialog } from "@/components/appointment-card";
import { CalendarIcon, SearchIcon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { appointmentsFor, isUpcoming, type Viewer } from "@/lib/mock-data";

export default function PatientHome({ viewer }: { viewer: Extract<Viewer, { role: "patient" }> }) {
    const upcoming = appointmentsFor(viewer)
        .filter(isUpcoming)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
    const [next, ...later] = upcoming.filter((a) => a.status === "confirmed");
    const pending = upcoming.filter((a) => a.status === "pending");
    const find = (
        <Link href="/search" className="btn btn-primary">
            <SearchIcon /> Find an appointment
        </Link>
    );

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
                            <AppointmentCard a={next} viewer={viewer}>
                                <Link href={`/practitioners/${next.practitionerId}?reschedule=${next.id}`} className="btn btn-secondary">
                                    Reschedule
                                </Link>
                                <CancelDialog a={next} viewer={viewer} />
                            </AppointmentCard>
                        </section>
                    )}

                    {pending.length > 0 && (
                        <section aria-labelledby="pending">
                            <h2 id="pending" className="mb-3 text-lg font-semibold">Waiting for confirmation ({pending.length})</h2>
                            <ul className="space-y-3">
                                {pending.map((a) => <li key={a.id}><AppointmentCard a={a} viewer={viewer} /></li>)}
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
                                {later.map((a) => <li key={a.id}><AppointmentCard a={a} viewer={viewer} /></li>)}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </>
    );
}
