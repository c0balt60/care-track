// Who may do what to an appointment (SCH-5 #23).
//
// This file is pure: no database, no session. The detail page uses it to decide
// which buttons to show, and the server actions use it to decide what's allowed,
// so a hidden button and a refused action can't disagree. Change a rule here and
// both follow.
//
// | Action     | From      | Who                                         |
// |------------|-----------|---------------------------------------------|
// | approve    | pending   | the practitioner, or staff at their clinic  |
// | decline    | pending   | the practitioner, or staff at their clinic  |
// | cancel     | pending   | the patient ("withdraw request")            |
// | cancel     | confirmed | the patient, the practitioner, or staff     |
// | reschedule | confirmed | the patient                                 |
//
// Nothing is allowed once the appointment has started.
import type { ReadyViewer } from "./auth";
import type { APPOINTMENT_STATUSES } from "./db/schema";

/**
 * How close to the start a patient may still cancel or reschedule a confirmed
 * appointment. 0 means right up to the start. The clinic side (practitioner,
 * staff) is never held to this, and withdrawing a pending request isn't either.
 */
export const PATIENT_CHANGE_CUTOFF_HOURS = 0;

export type AppointmentAction = "approve" | "decline" | "cancel" | "reschedule";

/** The fields the rules look at. `clinicId` is the practitioner's clinic. */
export type RulesAppointment = {
  status: (typeof APPOINTMENT_STATUSES)[number];
  startsAt: Date;
  patientId: string;
  practitionerId: string;
  clinicId: string | null;
};

/**
 * True when the viewer is a party to the appointment and may open it. Admins
 * aren't: managing other people's appointments is ADM-1 (#32).
 */
export function involves(viewer: ReadyViewer, a: RulesAppointment): boolean {
  switch (viewer.role) {
    case "patient": return a.patientId === viewer.patientId;
    case "practitioner": return a.practitionerId === viewer.practitionerId;
    case "staff": return a.clinicId !== null && a.clinicId === viewer.clinicId;
    case "admin": return false;
  }
}

/** What the viewer may do to the appointment right now. Empty when nothing. */
export function allowedActions(viewer: ReadyViewer, a: RulesAppointment, now = new Date()): AppointmentAction[] {
  if (!involves(viewer, a) || a.startsAt.getTime() <= now.getTime()) return [];

  const clinicSide = viewer.role === "practitioner" || viewer.role === "staff";
  const hoursLeft = (a.startsAt.getTime() - now.getTime()) / 3_600_000;

  switch (a.status) {
    case "pending":
      if (clinicSide) return ["approve", "decline"];
      if (viewer.role === "patient") return ["cancel"];
      return [];
    case "confirmed":
      if (clinicSide) return ["cancel"];
      if (viewer.role === "patient" && hoursLeft > PATIENT_CHANGE_CUTOFF_HOURS) return ["reschedule", "cancel"];
      return [];
    default:
      // declined, cancelled, completed: final.
      return [];
  }
}

export const can = (viewer: ReadyViewer, a: RulesAppointment, action: AppointmentAction, now = new Date()) =>
  allowedActions(viewer, a, now).includes(action);

/**
 * The clinic side must say why it cancels: the patient is losing a time they
 * were counting on. Patients may leave it blank.
 */
export const cancelReasonRequired = (viewer: ReadyViewer) => viewer.role !== "patient";
