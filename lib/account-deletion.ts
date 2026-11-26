// Deleting an account (#78). Patients delete their own from Settings (password required);
// admins can delete any account from /admin (deleteUser in ./admin-users.ts).
//
// "Delete" here means: the login is gone, the person can't be identified, and the clinic's
// records stay. Concretely, in one transaction:
//   1. The patient's upcoming appointments are cancelled ("Account deleted"), freeing the slots.
//   2. The patients row is anonymized, not deleted: appointments point at it and must stay
//      (records are kept 6 years, see ./retention.ts). Name "Deleted patient", no DOB, no phone.
//   3. The users row is deleted. Sessions and the password hash go with it (ON DELETE CASCADE),
//      which signs them out everywhere, and the email address is free to sign up again.
// Each step writes its audit row. The audit log keeps the user's id, which no longer points at
// anyone, and never held their name, email or phone (patient diffs are redacted).
import { and, eq, gt, inArray } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit, redactedDiff, type Executor } from "./audit";
import { db } from "./db";
import { accounts, appointmentEvents, appointments, patients, users } from "./db/schema";

/** What a deleted patient is called on the clinic's appointment pages. */
export const DELETED_PATIENT_NAME = "Deleted patient";
/** The cancel reason the clinic sees on appointments cancelled by a deletion. */
export const ACCOUNT_DELETED = "Account deleted";

/** Messages for /settings?error=. Only these keys are shown, so the URL can't inject text. */
export const accountDeletionErrors = {
  password: "That password isn't right, so your account wasn't deleted.",
  "too-many": "Too many attempts. Try again in a few minutes.",
};

/**
 * Cancels the user's upcoming appointments, anonymizes their patient row (if they have one)
 * and deletes the user. Run inside the caller's transaction; `actorId` is who asked (the user
 * themselves, or an admin). Returns false if the user doesn't exist.
 */
export async function eraseAccount(tx: Executor, actorId: string, userId: string, now = new Date()) {
  const [user] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).for("update");
  if (!user) return false;

  // Locked, like a booking does (lib/booking.ts), so no booking can slip in mid-deletion.
  const [patient] = await tx
    .select({ id: patients.id, name: patients.name, dob: patients.dob, phone: patients.phone })
    .from(patients)
    .where(eq(patients.userId, userId))
    .for("update");

  if (patient) {
    const upcoming = await tx
      .select({ id: appointments.id, status: appointments.status })
      .from(appointments)
      .where(and(eq(appointments.patientId, patient.id), inArray(appointments.status, ["pending", "confirmed"]), gt(appointments.startsAt, now)));
    if (upcoming.length) {
      await tx
        .update(appointments)
        .set({ status: "cancelled", cancelledBy: "patient", cancelReason: ACCOUNT_DELETED })
        .where(inArray(appointments.id, upcoming.map((a) => a.id)));
      // On the patient's request, so the timeline says "Cancelled by the patient".
      await tx.insert(appointmentEvents).values(
        upcoming.map((a) => ({ appointmentId: a.id, type: "cancelled" as const, actorUserId: userId, actorRole: "patient" as const, note: ACCOUNT_DELETED })),
      );
      for (const a of upcoming) {
        await audit(actorId, "appointment.cancel", "appointments", a.id, { status: { from: a.status, to: "cancelled" } }, tx);
      }
    }

    const anonymous = { name: DELETED_PATIENT_NAME, dob: null, phone: null };
    await tx.update(patients).set({ ...anonymous, userId: null, deletedAt: now }).where(eq(patients.id, patient.id));
    await audit(actorId, "patient.anonymize", "patients", patient.id, redactedDiff(patient, anonymous), tx);
  }

  await tx.delete(users).where(eq(users.id, userId));
  await audit(actorId, "user.delete", "users", userId, { role: { from: user.role, to: null } }, tx);
  return true;
}

const passwordInput = z.string().min(1).max(128);

/**
 * A user deleting their own account. Their password must be right: someone who finds a laptop
 * left signed in can't delete the account. The caller rate-limits it like log-in.
 * Checked against the stored scrypt hash directly, since /api/auth/verify-password is disabled.
 */
export async function deleteOwnAccount(
  userId: string,
  passwordInputValue: unknown,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: "password" }> {
  const password = passwordInput.safeParse(passwordInputValue);
  if (!password.success) return { ok: false, error: "password" };

  const [account] = await db
    .select({ hash: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!account?.hash || !(await verifyPassword({ hash: account.hash, password: password.data }))) return { ok: false, error: "password" };

  await db.transaction((tx) => eraseAccount(tx, userId, userId, now));
  return { ok: true };
}
