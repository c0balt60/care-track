"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { parsePatientDetails } from "@/lib/patient-details";
import { getCurrentPatient } from "./current-patient";

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
