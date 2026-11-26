"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeRole, deleteUser, disableUser, enableUser, type AdminResult } from "@/lib/admin-users";
import { getViewerAs } from "@/lib/auth";

// The acting admin always comes from the session. The user id comes from the form, which
// is fine: admins may act on any account, and lib/admin-users.ts checks it's a real user.
async function adminOrLogin() {
  const admin = await getViewerAs("admin");
  if (!admin) redirect("/login");
  return admin;
}

function finish(result: AdminResult, notice: string): never {
  revalidatePath("/admin");
  redirect(result.ok ? `/admin?notice=${notice}` : `/admin?error=${result.error}`);
}

export async function setRole(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await changeRole(admin.userId, String(formData.get("userId") ?? ""), formData.get("role")), "role");
}

export async function disableAccount(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await disableUser(admin.userId, String(formData.get("userId") ?? "")), "disabled");
}

export async function enableAccount(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await enableUser(admin.userId, String(formData.get("userId") ?? "")), "enabled");
}

/** Deletes an account on request (#78). See deleteUser in lib/admin-users.ts. */
export async function deleteAccount(formData: FormData) {
  const admin = await adminOrLogin();
  finish(await deleteUser(admin.userId, String(formData.get("userId") ?? "")), "deleted");
}