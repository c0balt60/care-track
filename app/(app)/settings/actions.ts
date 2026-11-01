"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { patients, practitioners } from "@/lib/db/schema";
import { parsePatientDetails } from "@/lib/patient-details";
import { parsePractitionerProfile } from "@/lib/practitioner-profile";
import { getCurrentPatient } from "./current-patient";
import { getCurrentPractitioner } from "./current-practitioner";

/** Saves the signed-in patient's name, DOB, and phone from the /settings form. */
export async function updatePatientDetails(formData: FormData) {
  // Identify the patient on the server. Never trust an id sent in the form.
  const patient = await getCurrentPatient();
  if (!patient) redirect("/settings?error=no-patient");

  const parsed = parsePatientDetails(formData);
  if (!parsed.ok) redirect(`/settings?error=${parsed.error}`);

  await db.update(patients).set(parsed.data).where(eq(patients.id, patient.id));

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
