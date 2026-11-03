import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clinics } from "@/lib/db/schema";
import { getViewerAs } from "@/lib/auth";

/** The clinics row the signed-in staff member works at, or null if they aren't staff. */
export async function getCurrentClinic() {
  // getViewer picks the staff member's first clinic (see the ponytail note in lib/auth.ts).
  const viewer = await getViewerAs("staff");
  if (!viewer) return null;

  const [row] = await db
    .select({
      id: clinics.id,
      name: clinics.name,
      phone: clinics.phone,
      address: clinics.address,
      city: clinics.city,
      services: clinics.services,
    })
    .from(clinics)
    .where(eq(clinics.id, viewer.clinicId))
    .limit(1);
  return row ?? null;
}
