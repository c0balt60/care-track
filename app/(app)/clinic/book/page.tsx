import { PractitionerCard } from "@/components/practitioner-card";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { demoViewer, getClinic, practitioners } from "@/lib/mock-data";

export default async function ClinicBook() {
  const viewer = demoViewer(await requireRole("staff"));

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
