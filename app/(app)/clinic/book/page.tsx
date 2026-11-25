import { notFound } from "next/navigation";
import { PractitionerCard } from "@/components/practitioner-card";
import { PageHeader } from "@/components/ui";
import { clinicById } from "@/lib/appointment-lists";
import { requireRole } from "@/lib/auth";
import { searchPractitioners } from "@/lib/practitioner-search";

// Front desk picks a time here, then finds or adds the patient on /book/[slotId] (SCH-6 #24).
export default async function ClinicBook() {
  const viewer = await requireRole("staff");
  // Only the staff member's own clinic: the id comes from their session, never the URL.
  // Every practitioner there, including ones an admin hasn't verified yet: they're hidden
  // from public search, but the clinic can still book for them.
  const [clinic, team] = await Promise.all([
    clinicById(viewer.clinicId),
    searchPractitioners({ clinicId: viewer.clinicId, includeUnverified: true }),
  ]);
  if (!clinic) notFound();

  return (
    <>
      <PageHeader title="Book for a patient" description={`Pick a time at ${clinic.name}, then find or add the patient.`} />
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
