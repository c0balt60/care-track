import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MapPinIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { db } from "@/lib/db";
import { clinics, practitioners } from "@/lib/db/schema";
import { type Practitioner, practitioners as mockPractitioners } from "@/lib/mock-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClinicProfile({ params }: PageProps<"/clinics/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound(); // Postgres throws on a malformed uuid
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, id)).limit(1);
  if (!clinic) notFound();

  const team = await db
    .select({
      name: practitioners.name,
      credentials: practitioners.credentials,
      specialty: practitioners.specialty,
      services: practitioners.services,
      bio: practitioners.bio,
      city: practitioners.city,
      bookingMode: practitioners.bookingMode,
      timeZone: practitioners.timeZone,
      slotMinutes: practitioners.slotMinutes,
    })
    .from(practitioners)
    .where(eq(practitioners.clinicId, clinic.id))
    .orderBy(practitioners.name);

  // ponytail: TEMPORARY. Hours, slots, and profile links are still mock data, matched by name.
  // A practitioner with no mock match shows no times. Drop this once availability lives in the DB.
  const cards: Practitioner[] = team.map((row) => {
    const mock = mockPractitioners.find((m) => m.name === row.name);
    return { id: "", hours: {}, exceptions: [], ...mock, ...row, clinicId: null };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="card p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{clinic.name}</h1>
        <p className="mt-1 flex items-center gap-1 text-muted">
          <MapPinIcon width={16} height={16} /> {clinic.address}, {clinic.city}
        </p>
        <p className="mt-1">
          <a href={`tel:${clinic.phone.replace(/\D/g, "")}`} className="link">{clinic.phone}</a>
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {clinic.services.map((s) => <li key={s} className="tag">{s}</li>)}
        </ul>
      </header>

      <h2 className="mt-8 mb-4 text-lg font-semibold">Practitioners</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {cards.map((p) => (
          <li key={p.name}>
            <PractitionerCard p={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}
