import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import type { Role, Viewer } from "./mock-data";

const viewers: Record<Role, Viewer> = {
  patient: { role: "patient", name: "Jordan Lee", patientId: "jordan" },
  practitioner: { role: "practitioner", name: "Dr. Sam Rivera", practitionerId: "rivera" },
  staff: { role: "staff", name: "Morgan Ellis", clinicId: "northside" },
};

/**
 * Who is "signed in". Set by the prototype bar's role switcher; null means
 * signed out. The real app reads the session here instead.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const role = (await cookies()).get("preview-role")?.value ?? "patient";
  return Object.hasOwn(viewers, role) ? viewers[role as Role] : null;
});

export async function requireRole<R extends Role>(
  ...roles: R[]
): Promise<Extract<Viewer, { role: R }>> {
  const viewer = await getViewer();

  // Redirect to login if the user is not signed in
  if (!viewer) {
    redirect("/login");
  }

  // Return a 404 page if the user does not have the required role
  if (!roles.includes(viewer.role as R)) {
    notFound();
  }

  // Return the authenticated viewer with the correct role type
  return viewer as Extract<Viewer, { role: R }>;
}