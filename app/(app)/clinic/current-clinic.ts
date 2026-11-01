import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clinics, clinicStaff, users } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth";

/** The clinics row the signed-in staff member works at, or null. */
export async function getCurrentClinic() {
  const viewer = await getViewer();
  if (viewer?.role !== "staff") return null;

  // ponytail: TEMPORARY mock auth, same as settings/current-patient.ts. Match the mock viewer to a users row by
  // email ("Morgan Ellis" -> morgan.ellis@example.com). Replace with the session's user id once Better Auth (#11) lands.
  const email = `${viewer.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;

  // ponytail: first clinic only. Staff at several clinics need a clinic switcher.
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
    .innerJoin(clinicStaff, eq(clinicStaff.clinicId, clinics.id))
    .innerJoin(users, eq(users.id, clinicStaff.userId))
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  return row ?? null;
}
