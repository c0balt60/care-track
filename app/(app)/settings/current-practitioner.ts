import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { getViewerAs } from "@/lib/auth";

/** The practitioners row for whoever is signed in, or null if they aren't a practitioner. */
export async function getCurrentPractitioner() {
  const viewer = await getViewerAs("practitioner");
  if (!viewer) return null;

  const [row] = await db
    .select({
      id: practitioners.id,
      credentials: practitioners.credentials,
      specialty: practitioners.specialty,
      services: practitioners.services,
      bio: practitioners.bio,
    })
    .from(practitioners)
    .where(eq(practitioners.id, viewer.practitionerId))
    .limit(1);
  return row ?? null;
}
