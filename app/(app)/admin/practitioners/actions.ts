"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setVerified, type PractitionerAdminResult } from "@/lib/admin-practitioners";
import { getViewerAs } from "@/lib/auth";

// The acting admin always comes from the session. The practitioner id comes from the form,
// which is fine: admins may verify anyone, and lib/admin-practitioners.ts checks it exists.
// Not shared with ../actions.ts: anything exported from a "use server" file becomes an endpoint.
async function adminOrLogin() {
  const admin = await getViewerAs("admin");
  if (!admin) redirect("/login");
  return admin;
}

function finish(result: PractitionerAdminResult, notice: string): never {
  // Only this page needs it. /search and the other listings read the session in their
  // layout, so they're rendered fresh on every request and pick the change up anyway.
  revalidatePath("/admin/practitioners");
  redirect(result.ok ? `/admin/practitioners?notice=${notice}` : `/admin/practitioners?error=${result.error}`);
}

export async function verifyPractitioner(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await setVerified(admin.userId, String(formData.get("practitionerId") ?? ""), true), "verified");
}

export async function unverifyPractitioner(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await setVerified(admin.userId, String(formData.get("practitionerId") ?? ""), false), "unverified");
}
