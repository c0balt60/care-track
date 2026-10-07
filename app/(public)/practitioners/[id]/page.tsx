import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoIcon, MapPinIcon } from "@/components/icons";
import { SlotPicker } from "@/components/slot-picker";
import { Avatar, param } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { getAppointment, getClinic, getPractitioner } from "@/lib/mock-data";

export default async function PractitionerProfile({ params, searchParams }: PageProps<"/practitioners/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const p = getPractitioner(id);
  if (!p) notFound();

  const clinic = getClinic(p.clinicId);
  const old = getAppointment(param(sp.reschedule) ?? "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {old && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-teal-200 bg-accent-soft px-4 py-3 text-teal-900">
          <InfoIcon className="mt-0.5 shrink-0" />
          <span>
            Pick a new time for your {formatWhen(old.start, p.timeZone)} appointment.{" "}
            <Link href={`/appointments/${old.id}`} className="link">Keep my current time</Link>
          </span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10">
        <header className="flex gap-4">
          <Avatar name={p.name} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}, {p.credentials}</h1>
            <p className="text-lg">{p.specialty}</p>
            <p className="mt-1 flex items-center gap-1 text-muted">
              <MapPinIcon width={16} height={16} />
              {clinic ? (
                <Link href={`/clinics/${clinic.id}`} className="link">{clinic.name} · {clinic.city}</Link>
              ) : (
                p.city
              )}
            </p>
          </div>
        </header>

        <section aria-labelledby="book" className="card p-4 sm:p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 id="book" className="text-lg font-semibold">{old ? "Pick a new time" : "Book an appointment"}</h2>
          <p className="mb-4 text-sm text-muted">
            {p.bookingMode === "instant" ? "Confirmed instantly" : `${p.name} reviews each request`}
          </p>
          <SlotPicker
            p={p}
            week={Number(param(sp.week)) || 0}
            day={param(sp.day)}
            query={old ? { reschedule: old.id } : {}}
          />
        </section>

        <section aria-labelledby="about" className="space-y-6">
          <h2 id="about" className="sr-only">About</h2>
          <div>
            <h3 className="font-semibold">Services</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {p.services.map((s) => <li key={s} className="tag">{s}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Location</h3>
            <p className="mt-1 text-muted">
              {clinic ? <>{clinic.name}<br />{clinic.address}, {clinic.city}<br />{clinic.phone}</> : p.city}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">About</h3>
            <p className="mt-1 max-w-prose text-muted">{p.bio}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
