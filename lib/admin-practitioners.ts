// Admin practitioner verification (ADM-2 #33): verify or unverify a practitioner.
//
// Only verified practitioners show up in listings (/search, the home page, clinic pages;
// see ./practitioner-search). Their profile page and booking still work by direct link.
//
// Each change writes its audit row in the same transaction, like ./admin-users. The row is
// locked first, so two admins clicking at once can't both change it: the second waits,
// sees the first one's result, and gets "no_change" instead of a second audit row.
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { audit } from "./audit";
import { db } from "./db";
import { clinics, practitioners } from "./db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PractitionerAdminError = "not_found" | "no_change";
export type PractitionerAdminResult = { ok: true } | { ok: false; error: PractitionerAdminError };

/** Messages for /admin/practitioners?error=. Only these keys are shown, so the URL can't inject text. */
export const practitionerAdminErrors: Record<PractitionerAdminError, string> = {
  not_found: "That practitioner doesn't exist.",
  no_change: "Nothing to change: the practitioner is already that way.",
};

/** Every practitioner, unverified first (they're the ones waiting on an admin), then by name. */
export async function listPractitionersForAdmin() {
  return db
    .select({
      id: practitioners.id,
      name: practitioners.name,
      credentials: practitioners.credentials,
      specialty: practitioners.specialty,
      city: practitioners.city,
      clinicName: clinics.name,
      hasAccount: isNotNull(practitioners.userId),
      verifiedAt: practitioners.verifiedAt,
    })
    .from(practitioners)
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .orderBy(sql`${practitioners.verifiedAt} is not null`, asc(practitioners.name), asc(practitioners.id))
    .limit(200);
}

/** Verifies (verified = true) or unverifies a practitioner, and records who did it. */
export async function setVerified(
  actorId: string,
  practitionerId: string,
  verified: boolean,
  now = new Date(),
): Promise<PractitionerAdminResult> {
  if (!UUID.test(practitionerId)) return { ok: false, error: "not_found" }; // Postgres throws on a malformed uuid

  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ verifiedAt: practitioners.verifiedAt })
      .from(practitioners)
      .where(eq(practitioners.id, practitionerId))
      .for("update");
    if (!p) return { ok: false, error: "not_found" } as const;
    const was = p.verifiedAt !== null;
    if (was === verified) return { ok: false, error: "no_change" } as const;

    await tx.update(practitioners).set({ verifiedAt: verified ? now : null }).where(eq(practitioners.id, practitionerId));
    await audit(
      actorId,
      verified ? "practitioner.verify" : "practitioner.unverify",
      "practitioners",
      practitionerId,
      { verified: { from: was, to: verified } },
      tx,
    );
    return { ok: true } as const;
  });
}
