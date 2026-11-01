import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoIcon, MapPinIcon } from "@/components/icons";
import { SlotPicker } from "@/components/slot-picker";
import { Avatar, param } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { db } from "@/lib/db";
import { clinics, practitioners } from "@/lib/db/schema";
import { getAppointment, getPractitioner } from "@/lib/mock-data";

export default async function PractitionerProfile({ params, searchParams }: PageProps<"/practitioners/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const mock = getPractitioner(id);
  if (!mock) notFound();

  // Profile text and clinic come from the DB; hours and slots are still mock data.
  // ponytail: TEMPORARY. Links still use mock ids ("rivera"), not DB uuids, so match the row by name.
  // Look up by id once practitioners, slots, and links move to the DB.
  const [row] = await db
    .select({
      name: practitioners.name,
      credentials: practitioners.credentials,
      specialty: practitioners.specialty,
      services: practitioners.services,
      bio: practitioners.bio,
      city: practitioners.city,
      bookingMode: practitioners.bookingMode,
      clinic: { id: clinics.id, name: clinics.name, address: clinics.address, city: clinics.city, phone: clinics.phone },
    })
    .from(practitioners)
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .where(eq(practitioners.name, mock.name))
    .limit(1);
  const { clinic, ...profile } = row ?? { clinic: null };
  const p = { ...mock, ...profile };
  const old = getAppointment(param(sp.reschedule) ?? "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {old && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
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
