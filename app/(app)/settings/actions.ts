"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, redactedDiff } from "@/lib/audit";
import { db } from "@/lib/db";
import { getViewerAs } from "@/lib/auth";
import { patients, practitioners, users } from "@/lib/db/schema";
import { parsePatientDetails } from "@/lib/patient-details";
import { parsePractitionerProfile } from "@/lib/practitioner-profile";
import { getCurrentPractitioner } from "./current-practitioner";

/** Saves the signed-in patient's name, DOB, and phone from the /settings form. */
export async function updatePatientDetails(formData: FormData) {
  // Identify the patient on the server. Never trust an id sent in the form.
  const viewer = await getViewerAs("patient");
  if (!viewer) redirect("/settings?error=no-patient");

  const parsed = parsePatientDetails(formData);
  if (!parsed.ok) redirect(`/settings?error=${parsed.error}`);

  // The name lives in two rows: patients.name (the profile) and users.name (the
  // account, which the session and sidebar read). Update both or neither, and
  // the audit row with them.
  const saved = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ name: patients.name, dob: patients.dob, phone: patients.phone })
      .from(patients)
      .where(eq(patients.id, viewer.patientId))
      .limit(1);
    if (!before) return false;

    await tx.update(patients).set(parsed.data).where(eq(patients.id, viewer.patientId));
    await tx.update(users).set({ name: parsed.data.name }).where(eq(users.id, viewer.userId));
    await audit(viewer.userId, "patient.update", "patients", viewer.patientId, redactedDiff(before, parsed.data), tx);
    return true;
  });
  if (!saved) redirect("/settings?error=no-patient");

  revalidatePath("/settings");
  redirect("/settings?notice=saved");
}

/** Saves the signed-in practitioner's public profile (credentials, specialty, services, bio). */
export async function updatePractitionerProfile(formData: FormData) {
  // Identify the practitioner on the server. Never trust an id sent in the form.
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) redirect("/settings?error=no-practitioner");

  const parsed = parsePractitionerProfile(formData);
  if (!parsed.ok) redirect(`/settings?error=${parsed.error}`);

  await db.update(practitioners).set(parsed.data).where(eq(practitioners.id, practitioner.id));

  revalidatePath("/settings");
  revalidatePath("/practitioners/[id]", "page");
  redirect("/settings?notice=saved");
}