"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, diffOf } from "@/lib/audit";
import { getViewerAs } from "@/lib/auth";
import { db } from "@/lib/db";
import { clinics, practitioners } from "@/lib/db/schema";
import { parseClinicProfile } from "@/lib/clinic-profile";
import { isId } from "@/lib/validation";
import { getCurrentClinic } from "./current-clinic";

/** Saves the staff member's clinic profile from the /clinic form. */
export async function updateClinicProfile(formData: FormData) {
  // The clinic comes from who is signed in, never from the form, so staff can only edit their own clinic.
  const clinic = await getCurrentClinic();
  const viewer = await getViewerAs("staff");
  if (!clinic || !viewer) redirect("/clinic?error=no-clinic");

  const parsed = parseClinicProfile(formData);
  if (!parsed.ok) redirect(`/clinic?error=${parsed.error}`);

  // The change and its audit row commit together (CMP-1 #39: this wasn't audited before).
  await db.transaction(async (tx) => {
    await tx.update(clinics).set(parsed.data).where(eq(clinics.id, clinic.id));
    await audit(viewer.userId, "clinic.update", "clinics", clinic.id, diffOf(clinic, parsed.data), tx);
  });

  revalidatePath("/clinic");
  revalidatePath("/clinics/[id]", "page");
  redirect("/clinic?notice=saved");
}

/** Takes a practitioner off the staff member's clinic. Their account and booked appointments stay. */
export async function removePractitioner(formData: FormData) {
  const clinic = await getCurrentClinic();
  const viewer = await getViewerAs("staff");
  if (!clinic || !viewer) redirect("/clinic?error=no-clinic");

  // The id comes from the form, so the WHERE also requires the practitioner to be on this clinic.
  const id = formData.get("practitionerId");
  if (!isId(id)) redirect("/clinic?error=not-on-team");
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(practitioners)
      .set({ clinicId: null })
      .where(and(eq(practitioners.id, id), eq(practitioners.clinicId, clinic.id)))
      .returning({ id: practitioners.id });
    if (rows.length) {
      await audit(viewer.userId, "practitioner.leave_clinic", "practitioners", id, { clinicId: { from: clinic.id, to: null } }, tx);
    }
    return rows.length > 0;
  });
  if (!removed) redirect("/clinic?error=not-on-team");

  revalidatePath("/clinic");
  revalidatePath("/clinics/[id]", "page");
  revalidatePath("/practitioners/[id]", "page");
  redirect("/clinic?notice=removed");
}
