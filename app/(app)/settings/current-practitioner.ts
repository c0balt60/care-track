import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners, users } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth";

/** The practitioners row for whoever is signed in, or null. */
export async function getCurrentPractitioner() {
  const viewer = await getViewer();
  if (viewer?.role !== "practitioner") return null;

  // ponytail: TEMPORARY mock auth, same as current-patient.ts. Match the mock viewer to a users row by
  // email ("Dr. Sam Rivera" -> sam.rivera@example.com). Replace with the session's user id once Better Auth (#11) lands.
  const email = `${viewer.name.replace(/^Dr\.\s*/, "").toLowerCase().replace(/\s+/g, ".")}@example.com`;

  const [row] = await db
    .select({
      id: practitioners.id,
      credentials: practitioners.credentials,
      specialty: practitioners.specialty,
      services: practitioners.services,
      bio: practitioners.bio,
    })
    .from(practitioners)
    .innerJoin(users, eq(users.id, practitioners.userId))
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  return row ?? null;
}
