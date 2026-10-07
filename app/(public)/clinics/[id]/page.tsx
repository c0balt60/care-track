import { notFound } from "next/navigation";
import { MapPinIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { getClinic, practitioners } from "@/lib/mock-data";

export default async function ClinicProfile({ params }: PageProps<"/clinics/[id]">) {
  const { id } = await params;
  const clinic = getClinic(id);
  if (!clinic) notFound();

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
        {practitioners.filter((p) => p.clinicId === clinic.id).map((p) => (
          <li key={p.id}>
            <PractitionerCard p={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}
