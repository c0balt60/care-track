import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { getViewerAs } from "@/lib/auth";

/** The patients row for whoever is signed in, or null if they aren't a patient. */
export async function getCurrentPatient() {
  const viewer = await getViewerAs("patient");
  if (!viewer) return null;

  const [row] = await db
    .select({ id: patients.id, name: patients.name, dob: patients.dob, phone: patients.phone })
    .from(patients)
    .where(eq(patients.id, viewer.patientId))
    .limit(1);
  return row ?? null;
}
