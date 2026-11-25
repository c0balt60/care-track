"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { notifyAppointment } from "@/lib/appointment-emails";
import { getViewer, getViewerAs } from "@/lib/auth";
import { bookingErrors, bookSlot } from "@/lib/booking";
import { db } from "@/lib/db";
import { dob, parsePatientDetails } from "@/lib/patient-details";
import { createPatient, lookupPatients, patientMatching, type FoundPatient } from "@/lib/patient-lookup";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { id, parse, requiredText } from "@/lib/validation";

/**
 * Books the slot for the signed-in patient. Bound to the slot id, and to the
 * appointment being moved when rescheduling, by the /book/[slotId] form.
 * bookSlot() checks that appointment belongs to this patient; the id isn't trusted.
 */
export async function bookAppointment(slotId: string, rescheduleFromId: string | null, formData: FormData) {
  const here = `/book/${encodeURIComponent(slotId)}${rescheduleFromId ? `?reschedule=${encodeURIComponent(rescheduleFromId)}` : ""}`;
  const join = rescheduleFromId ? "&" : "?";

  // The patient comes from who is signed in, never from the form.
  const patient = await getViewerAs("patient");
  if (!patient) {
    // Staff book through bookForPatient below; nobody else books.
    redirect((await getViewer()) ? `${here}${join}error=staff` : `/login?next=${encodeURIComponent(here)}`);
  }

  // Per signed-in user, not IP: only patients get this far.
  if (await rateLimit(`booking:user:${patient.userId}`, LIMITS.bookingPerUser)) redirect(`${here}${join}error=too_many`);

  const result = await bookSlot(patient, slotId, formData.get("reason"), new Date(), { rescheduleFromId });
  if (!result.ok) redirect(`${here}${join}error=${result.error}`);
  after(() => notifyAppointment(result.appointmentId));

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  if (rescheduleFromId) {
    revalidatePath(`/appointments/${rescheduleFromId}`);
    // Land on the new appointment, which links back to the old one.
    redirect(`/appointments/${result.appointmentId}?notice=${result.status === "confirmed" ? "moved" : "move_requested"}`);
  }
  redirect(`${here}?notice=${result.status === "confirmed" ? "booked" : "requested"}`);
}

// ---------- Staff book for a patient (SCH-6 #24) ----------
//
// Both actions run through useActionState (see staff-booking.tsx), so the patient's name and
// date of birth travel in the POST body and come back as state. They never reach the URL,
// which would put them in request logs (docs/compliance-checklist.md, "No PHI in URLs").
// The staff member and their clinic always come from the session.

/** What staff see when something is wrong. Worded for the front desk, not the patient. */
const staffMessages: Record<string, string> = {
  not_staff: "Only clinic staff can book for a patient.",
  name: "Enter the patient's full name.",
  dob: "Enter the patient's date of birth (a real date, not in the future).",
  phone: "Enter the patient's phone number.",
  patientId: "Choose the patient to book for.",
  reason: "Enter the reason for the visit (up to 1,000 characters).",
  mismatch: "That patient doesn't match the name and date of birth anymore. Look them up again.",
  patient_exists: "A patient with that name and date of birth already exists. Look them up again to book for them.",
  lookups: "Too many patient lookups. Try again in a few minutes.",
};
const message = (error: string) => staffMessages[error] ?? bookingErrors[error as keyof typeof bookingErrors] ?? "Something went wrong.";

const today = () => new Date().toISOString().slice(0, 10);
const lookupInput = () => z.object({ name: requiredText(200, "name"), dob: dob(today(), "dob") });

export type LookupState = { error?: string; name?: string; dob?: string; matches?: FoundPatient[] };

/** Finds patients by exact name + date of birth. Rate-limited, and every patient shown is audited. */
export async function lookupPatient(_prev: LookupState, form: FormData): Promise<LookupState> {
  const staff = await getViewerAs("staff");
  if (!staff) return { error: message("not_staff") };

  const input = parse(lookupInput(), form);
  if (!input.ok) return { error: message(input.error) };
  if (await rateLimit(`patient-lookup:user:${staff.userId}`, LIMITS.patientLookupPerUser)) return { error: message("lookups") };

  const { name, dob } = input.data;
  return { name, dob, matches: await lookupPatients(staff.userId, name, dob) };
}

export type StaffBookingState = { error?: string };

/** Carries a failed booking out of the transaction, so the patient it created is rolled back. */
class Rollback extends Error {
  constructor(readonly error: string) {
    super(error);
  }
}

/**
 * Books the slot for a patient the staff member looked up (mode "existing") or is adding now
 * (mode "new"). Bound to the slot id by the page. On success, opens the new appointment.
 */
export async function bookForPatient(slotId: string, _prev: StaffBookingState, form: FormData): Promise<StaffBookingState> {
  const viewer = await getViewerAs("staff");
  if (!viewer) return { error: message("not_staff") };
  const staff = { userId: viewer.userId, clinicId: viewer.clinicId };
  if (await rateLimit(`booking:user:${staff.userId}`, LIMITS.bookingPerUser)) return { error: message("too_many") };

  const reason = form.get("reason");
  const now = new Date();
  let appointmentId: string;

  if (form.get("mode") === "existing") {
    // The form sends the patient's id with the name and date of birth it was found by.
    // All three must still match, so an edited id can't book for someone else.
    const input = parse(lookupInput().extend({ patientId: id("patientId") }), form);
    if (!input.ok) return { error: message(input.error) };
    const patient = await patientMatching(input.data.patientId, input.data.name, input.data.dob);
    if (!patient) return { error: message("mismatch") };

    const result = await bookSlot({ patientId: patient.id, userId: patient.userId }, slotId, reason, now, { staff });
    if (!result.ok) return { error: message(result.error) };
    appointmentId = result.appointmentId;
  } else {
    const details = parsePatientDetails(form);
    if (!details.ok) return { error: message(details.error) };
    try {
      // Create the patient and book in one transaction: if the booking fails, no orphan record.
      appointmentId = await db.transaction(async (tx) => {
        const created = await createPatient(tx, staff.userId, details.data);
        if (!created.ok) throw new Rollback(created.error);
        const result = await bookSlot({ patientId: created.patientId, userId: null }, slotId, reason, now, { staff, tx });
        if (!result.ok) throw new Rollback(result.error);
        return result.appointmentId;
      });
    } catch (err) {
      if (err instanceof Rollback) return { error: message(err.error) };
      throw err;
    }
  }

  after(() => notifyAppointment(appointmentId)); // only patients with an account get email
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  redirect(`/appointments/${appointmentId}?notice=booked_for`);
}
