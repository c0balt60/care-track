import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { patients, users } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth";

/** The patients row for whoever is signed in, or null. */
export async function getCurrentPatient() {
  const viewer = await getViewer();
  if (viewer?.role !== "patient") return null;

  // ponytail: TEMPORARY mock auth. There are no real sessions yet, so we match the mock viewer to a
  // users row by email. Replace with the session's user id once Better Auth (#11) lands.
  const email = `${viewer.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;

  const [row] = await db
    .select({ id: patients.id, name: patients.name, dob: patients.dob, phone: patients.phone })
    .from(patients)
    .innerJoin(users, eq(users.id, patients.userId))
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  return row ?? null;
}
