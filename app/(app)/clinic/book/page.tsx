import { notFound } from "next/navigation";
import { PractitionerCard } from "@/components/practitioner-card";
import { PageHeader } from "@/components/ui";
import { getClinic, getViewer, practitioners } from "@/lib/mock-data";

export default async function ClinicBook() {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.role !== "staff") notFound();

  const clinic = getClinic(viewer.clinicId)!;

  return (
    <>
      <PageHeader title="Book for a patient" description={`Pick a time at ${clinic.name}, then choose or add the patient.`} />
      <ul className="grid gap-4 md:grid-cols-2">
        {practitioners.filter((p) => p.clinicId === clinic.id).map((p) => (
          <li key={p.id}>
            <PractitionerCard p={p} />
          </li>
        ))}
      </ul>
    </>
  );
}
