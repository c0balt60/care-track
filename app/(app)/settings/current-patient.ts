import { eq } from "drizzle-orm";
import { cache } from "react";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { getViewerAs } from "@/lib/auth";

/**
 * The patients row for whoever is signed in, or null if they aren't a patient.
 * Every read is logged (AUD-2 #15). cache() keeps it to one read, and one audit
 * row, per request however many components ask.
 */
export const getCurrentPatient = cache(async () => {
  const viewer = await getViewerAs("patient");
  if (!viewer) return null;

  const [row] = await db
    .select({ id: patients.id, name: patients.name, dob: patients.dob, phone: patients.phone })
    .from(patients)
    .where(eq(patients.id, viewer.patientId))
    .limit(1);
  if (row) await audit(viewer.userId, "patient.view", "patients", row.id);
  return row ?? null;
});