// Front-desk patient lookup and create, for staff booking for a patient (SCH-6 #24).
//
// Patients aren't tied to a clinic, so an open search would let staff at one clinic browse
// every patient's details. Instead staff look a patient up the way a front desk does: full
// name AND date of birth, both exact (any case, extra spaces ignored). Nothing partial comes
// back, so the list can't be browsed. Every patient shown is audited ("patient.lookup"), and
// the action rate-limits lookups so dates of birth can't be guessed one by one.
//
// What a match shows is just enough to tell two people apart: name, date of birth, whether
// they have an account, and the last 4 digits of their phone. Never the full phone.
import { and, asc, eq, sql } from "drizzle-orm";
import { audit, type Executor } from "./audit";
import { db } from "./db";
import { patients } from "./db/schema";
import type { PatientDetails } from "./patient-details";

export type FoundPatient = { id: string; name: string; dob: string; hasAccount: boolean; phoneLast4: string | null };

/** Lowercase, trimmed, inner runs of spaces made single: how names are compared. */
const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const sameName = (name: string) => sql`regexp_replace(lower(btrim(${patients.name})), '\\s+', ' ', 'g') = ${normalize(name)}`;

const last4 = (phone: string | null) => (phone ? phone.replace(/\D/g, "").slice(-4) || null : null);

/** Patients whose name and date of birth match exactly. Usually one; two people can share both. */
export async function findPatients(name: string, dob: string, executor: Executor = db): Promise<FoundPatient[]> {
  const rows = await executor
    .select({ id: patients.id, name: patients.name, dob: patients.dob, phone: patients.phone, userId: patients.userId })
    .from(patients)
    .where(and(sameName(name), eq(patients.dob, dob)))
    .orderBy(asc(patients.createdAt), asc(patients.id))
    .limit(10);
  return rows.map((r) => ({ id: r.id, name: r.name, dob: r.dob ?? dob, hasAccount: r.userId !== null, phoneLast4: last4(r.phone) }));
}

/** findPatients, plus an audit row for each patient shown to the staff member. */
export async function lookupPatients(staffUserId: string, name: string, dob: string): Promise<FoundPatient[]> {
  const found = await findPatients(name, dob);
  for (const p of found) await audit(staffUserId, "patient.lookup", "patients", p.id);
  return found;
}

/**
 * The patient with this id, but only if their name and date of birth still match what staff
 * looked up. The booking form sends all three back, so a form edited to carry some other
 * patient's id is refused rather than booked.
 */
export async function patientMatching(id: string, name: string, dob: string) {
  const [row] = await db
    .select({ id: patients.id, userId: patients.userId })
    .from(patients)
    .where(and(eq(patients.id, id), sameName(name), eq(patients.dob, dob)))
    .limit(1);
  return row ?? null;
}

/**
 * Creates a patient with no account (the front desk's record of them), audited. Refuses if
 * one with the same name and date of birth already exists, so a second click or a missed
 * lookup doesn't quietly make a duplicate.
 */
export async function createPatient(
  tx: Executor,
  staffUserId: string,
  details: PatientDetails,
): Promise<{ ok: true; patientId: string } | { ok: false; error: "patient_exists" }> {
  if ((await findPatients(details.name, details.dob, tx)).length) return { ok: false, error: "patient_exists" };
  const [row] = await tx.insert(patients).values({ ...details, userId: null }).returning({ id: patients.id });
  await audit(staffUserId, "patient.create", "patients", row.id, null, tx);
  return { ok: true, patientId: row.id };
}
