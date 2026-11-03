// Who is signed in, and what they may open. Every access check in the app goes
// through this file (AUTH-2 #12). Pattern: the "Data Access Layer" from the
// Next.js authentication guide (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "./better-auth";
import { db } from "./db";
import { clinicStaff, patients, practitioners } from "./db/schema";

type Account = { userId: string; name: string; email: string };

/**
 * The signed-in user. The id fields are DB uuids of the role's profile row, and
 * null when the account has the role but no row yet (e.g. someone who signed up
 * as a practitioner but isn't linked to a practitioners row). A null id grants nothing.
 */
export type Viewer = Account &
  (
    | { role: "patient"; patientId: string | null }
    | { role: "practitioner"; practitionerId: string | null }
    | { role: "staff"; clinicId: string | null }
    | { role: "admin" }
  );

export type Role = Viewer["role"];

type WithProfile<V> = {
  [K in keyof V]: K extends "patientId" | "practitionerId" | "clinicId" ? NonNullable<V[K]> : V[K];
};

/** A viewer whose profile row exists, so its id field is a string. */
export type ReadyViewer<R extends Role = Role> = R extends Role ? WithProfile<Extract<Viewer, { role: R }>> : never;

/** True when the viewer's role is backed by a profile row (admins need none). */
export function hasProfile(viewer: Viewer): viewer is ReadyViewer {
  switch (viewer.role) {
    case "patient": return viewer.patientId !== null;
    case "practitioner": return viewer.practitionerId !== null;
    case "staff": return viewer.clinicId !== null;
    case "admin": return true;
  }
}

/**
 * Reads the Better Auth session (httpOnly cookie, checked against the sessions
 * table), then looks up the role's profile id. null when signed out.
 * cache() runs it at most once per request, however many layouts and pages ask.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id: userId, name, email, role } = session.user;
  const account = { userId, name, email };

  switch (role) {
    case "patient": {
      const [row] = await db.select({ id: patients.id }).from(patients).where(eq(patients.userId, userId)).limit(1);
      return { ...account, role, patientId: row?.id ?? null };
    }
    case "practitioner": {
      const [row] = await db
        .select({ id: practitioners.id })
        .from(practitioners)
        .where(eq(practitioners.userId, userId))
        .limit(1);
      return { ...account, role, practitionerId: row?.id ?? null };
    }
    case "staff": {
      // ponytail: first clinic only. Staff at several clinics need a clinic switcher.
      const [row] = await db
        .select({ clinicId: clinicStaff.clinicId })
        .from(clinicStaff)
        .where(eq(clinicStaff.userId, userId))
        .orderBy(asc(clinicStaff.createdAt))
        .limit(1);
      return { ...account, role, clinicId: row?.clinicId ?? null };
    }
    case "admin":
      return { ...account, role };
    default:
      // A role this code doesn't know grants nothing: treat the user as signed out.
      return null;
  }
});

/**
 * The viewer if their role is one of `roles` AND their profile row exists, else null.
 * Never redirects, so server actions and data helpers can use it.
 */
export async function getViewerAs<R extends Role>(...roles: R[]): Promise<ReadyViewer<R> | null> {
  const viewer = await getViewer();
  if (!viewer || !roles.includes(viewer.role as R) || !hasProfile(viewer)) return null;
  return viewer as ReadyViewer<R>;
}

/**
 * For pages: signed out goes to /login; the wrong role, or the right role with no
 * profile row, gets a 404 (it doesn't reveal that the page exists).
 */
export async function requireRole<R extends Role>(...roles: R[]): Promise<ReadyViewer<R>> {
  if (!(await getViewer())) redirect("/login");
  const viewer = await getViewerAs(...roles);
  if (!viewer) notFound();
  return viewer;
}
