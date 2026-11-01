"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clinics, practitioners } from "@/lib/db/schema";
import { parseClinicProfile } from "@/lib/clinic-profile";
import { getCurrentClinic } from "./current-clinic";

/** Saves the staff member's clinic profile from the /clinic form. */
export async function updateClinicProfile(formData: FormData) {
  // The clinic comes from who is signed in, never from the form, so staff can only edit their own clinic.
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/clinic?error=no-clinic");

  const parsed = parseClinicProfile(formData);
  if (!parsed.ok) redirect(`/clinic?error=${parsed.error}`);

  await db.update(clinics).set(parsed.data).where(eq(clinics.id, clinic.id));

  revalidatePath("/clinic");
  revalidatePath("/clinics/[id]", "page");
  redirect("/clinic?notice=saved");
}

/** Takes a practitioner off the staff member's clinic. Their account and booked appointments stay. */
export async function removePractitioner(formData: FormData) {
  const clinic = await getCurrentClinic();
  if (!clinic) redirect("/clinic?error=no-clinic");

  // The id comes from the form, so the WHERE also requires the practitioner to be on this clinic.
  const id = String(formData.get("practitionerId") ?? "");
  const removed = await db
    .update(practitioners)
    .set({ clinicId: null })
    .where(and(eq(practitioners.id, id), eq(practitioners.clinicId, clinic.id)))
    .returning({ id: practitioners.id })
    .catch(() => []); // a malformed uuid makes Postgres throw; treat it like "not found"
  if (!removed.length) redirect("/clinic?error=not-on-team");

  revalidatePath("/clinic");
  revalidatePath("/clinics/[id]", "page");
  revalidatePath("/practitioners/[id]", "page");
  redirect("/clinic?notice=removed");
}
