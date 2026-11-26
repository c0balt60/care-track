"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteOwnAccount } from "@/lib/account-deletion";
import { audit, diffOf, redactedDiff } from "@/lib/audit";
import { db } from "@/lib/db";
import { getViewerAs } from "@/lib/auth";
import { auth } from "@/lib/better-auth";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
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
  const viewer = await getViewerAs("practitioner");
  if (!practitioner || !viewer) redirect("/settings?error=no-practitioner");

  const parsed = parsePractitionerProfile(formData);
  if (!parsed.ok) redirect(`/settings?error=${parsed.error}`);

  // The change and its audit row commit together (CMP-1 #39: this wasn't audited before).
  // A public profile isn't PHI, so the diff keeps the values.
  await db.transaction(async (tx) => {
    await tx.update(practitioners).set(parsed.data).where(eq(practitioners.id, practitioner.id));
    await audit(viewer.userId, "practitioner.update", "practitioners", practitioner.id, diffOf(practitioner, parsed.data), tx);
  });

  revalidatePath("/settings");
  revalidatePath("/practitioners/[id]", "page");
  redirect("/settings?notice=saved");
}
/**
 * Deletes the signed-in patient's own account (#78): cancels their upcoming appointments,
 * anonymizes their patient record and deletes the login. See lib/account-deletion.ts.
 * Patients only; admins delete other accounts from /admin.
 */
export async function deleteMyAccount(formData: FormData) {
  // Who is deleted always comes from the session. The form only carries the password.
  const viewer = await getViewerAs("patient");
  if (!viewer) redirect("/settings?error=no-patient");

  // The password check counts against the log-in limits, so it can't be used to guess passwords.
  const h = await headers();
  if (
    (await rateLimit(`login:ip:${clientIp(h)}`, LIMITS.loginPerIp)) ||
    (await rateLimit(`login:email:${viewer.email.toLowerCase()}`, LIMITS.loginPerEmail))
  ) {
    redirect("/settings?error=too-many");
  }

  const result = await deleteOwnAccount(viewer.userId, formData.get("password"));
  if (!result.ok) redirect(`/settings?error=${result.error}`);

  // The session row went with the account; this clears the now-useless cookie too.
  try {
    await auth.api.signOut({ headers: h });
  } catch {
    // Nothing to sign out of: the session is already gone.
  }
  redirect("/login?notice=deleted");
}
