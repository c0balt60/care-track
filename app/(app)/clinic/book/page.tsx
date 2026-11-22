import { notFound } from "next/navigation";
import { PractitionerCard } from "@/components/practitioner-card";
import { PageHeader } from "@/components/ui";
import { clinicById } from "@/lib/appointment-lists";
import { requireRole } from "@/lib/auth";
import { searchPractitioners } from "@/lib/practitioner-search";

export default async function ClinicBook() {
  const viewer = await requireRole("staff");
  // Only the staff member's own clinic: the id comes from their session, never the URL.
  const [clinic, team] = await Promise.all([clinicById(viewer.clinicId), searchPractitioners({ clinicId: viewer.clinicId })]);
  if (!clinic) notFound();

  // ponytail: the time chips open /book/[slotId], which tells staff booking for a patient
  // "isn't ready yet" (bookingErrors.staff). Front-desk booking is SCH-6 (#24).
  return (
    <>
      <PageHeader title="Book for a patient" description={`Pick a time at ${clinic.name}, then choose or add the patient.`} />
      <ul className="grid gap-4 md:grid-cols-2">
        {team.map((r) => (
          <li key={r.practitioner.id}>
            <PractitionerCard result={r} />
          </li>
        ))}
      </ul>
    </>
  );
}
