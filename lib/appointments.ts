// Reading one appointment and changing its status (SCH-5 #23).
//
// Who may do what lives in ./appointment-rules (pure, no DB). This file does the
// database side: load the appointment, ask the rules, then write the change, its
// history event, and its audit row in one transaction.
//
// Races: every status change is `UPDATE ... WHERE id = $1 AND status = <expected>`.
// If the patient withdraws at the same moment the practitioner approves, only one
// update finds a matching row. The other gets error "stale" and the page reloads
// with the latest state. Same idea as booking: let the database pick the winner.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { can, cancelReasonRequired, involves, type AppointmentAction } from "./appointment-rules";
import { audit, type AuditDiff } from "./audit";
import type { ReadyViewer } from "./auth";
import { replaceOld, type Tx } from "./booking";
import { db } from "./db";
import { appointmentEvents, appointments, clinics, patients, practitioners } from "./db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Longest cancel reason or decline note we keep. */
export const NOTE_MAX = 1000;

/** The roles that can act on an appointment. Admins can't (see involves()). */
type ActingViewer = ReadyViewer<"patient" | "practitioner" | "staff">;

/**
 * The appointment with everything its page shows, or null when it doesn't exist
 * or the viewer isn't a party to it. Callers can't tell those apart, on purpose:
 * a 404 either way doesn't reveal which appointment ids exist.
 */
export async function loadAppointmentFor(viewer: ReadyViewer, id: string) {
  if (!UUID.test(id)) return null;

  const [row] = await db
    .select({ appointment: appointments, practitioner: practitioners, clinic: clinics, patient: patients })
    .from(appointments)
    .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row || !involves(viewer, rulesView(row.appointment, row.practitioner.clinicId))) return null;

  const link = { id: appointments.id, startsAt: appointments.startsAt, status: appointments.status };
  const [events, [movedFrom], [movedTo]] = await Promise.all([
    // seq breaks ties: events written in one transaction share the same `at`.
    db
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, id))
      .orderBy(asc(appointmentEvents.at), asc(appointmentEvents.seq)),
    // The appointment this one replaced.
    row.appointment.rescheduledFromId
      ? db.select(link).from(appointments).where(eq(appointments.id, row.appointment.rescheduledFromId)).limit(1)
      : Promise.resolve([]),
    // The live appointment replacing this one: a pending move request, or the confirmed new time.
    db
      .select(link)
      .from(appointments)
      .where(and(eq(appointments.rescheduledFromId, id), inArray(appointments.status, ["pending", "confirmed"])))
      .orderBy(desc(appointments.createdAt))
      .limit(1),
  ]);

  return { ...row, events, movedFrom: movedFrom ?? null, movedTo: movedTo ?? null };
}

/** The appointment as the rules see it. */
const rulesView = (a: typeof appointments.$inferSelect, clinicId: string | null) => ({
  status: a.status,
  startsAt: a.startsAt,
  patientId: a.patientId,
  practitionerId: a.practitionerId,
  clinicId,
});

/** Messages for /appointments/[id]?error=. Only these keys are shown, so the URL can't inject text. */
export const appointmentErrors = {
  stale: "This appointment changed while you had it open. Here's the latest.",
  forbidden: "You can't make that change to this appointment anymore.",
  reason: `Tell the patient why you're cancelling (up to ${NOTE_MAX.toLocaleString("en-US")} characters).`,
  note: `Keep the note under ${NOTE_MAX.toLocaleString("en-US")} characters.`,
};
export type AppointmentError = keyof typeof appointmentErrors;

type Result = { ok: true } | { ok: false; error: AppointmentError | "not_found" };

/** Trims a free-text field. "" becomes null; too long is an error. */
function cleanNote(input: unknown): { ok: true; value: string | null } | { ok: false } {
  const value = String(input ?? "").trim();
  if (value.length > NOTE_MAX) return { ok: false };
  return { ok: true, value: value || null };
}

/**
 * The shared shape of every status change: load inside the transaction, check
 * the rules, update only if the status is still what we checked, then write the
 * history event and the audit row. Any failure rolls all of it back.
 */
async function changeStatus(
  viewer: ActingViewer,
  id: string,
  action: AppointmentAction,
  now: Date,
  build: (current: typeof appointments.$inferSelect) => {
    set: Partial<typeof appointments.$inferInsert> & { status: (typeof appointments.$inferSelect)["status"] };
    event: (typeof appointmentEvents.$inferInsert)["type"];
    note: string | null;
    auditAction: string;
    diff: AuditDiff;
    /** Extra writes that must commit together with the change. */
    after?: (tx: Tx) => Promise<unknown>;
  },
): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: "not_found" };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ appointment: appointments, clinicId: practitioners.clinicId })
      .from(appointments)
      .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
      .where(eq(appointments.id, id))
      .limit(1);
    if (!row) return { ok: false, error: "not_found" } as const;

    const view = rulesView(row.appointment, row.clinicId);
    if (!involves(viewer, view)) return { ok: false, error: "not_found" } as const;
    if (!can(viewer, view, action, now)) return { ok: false, error: "forbidden" } as const;

    const change = build(row.appointment);
    const updated = await tx
      .update(appointments)
      .set(change.set)
      .where(and(eq(appointments.id, id), eq(appointments.status, row.appointment.status)))
      .returning({ id: appointments.id });
    // Someone else changed it between our read and our write.
    if (!updated.length) return { ok: false, error: "stale" } as const;

    await tx.insert(appointmentEvents).values({
      appointmentId: id,
      type: change.event,
      actorUserId: viewer.userId,
      actorRole: viewer.role,
      note: change.note,
    });
    await audit(viewer.userId, change.auditAction, "appointments", id, change.diff, tx);
    await change.after?.(tx);
    return { ok: true } as const;
  });
}

/** Free text can hold health details, so the audit log records that a note was given, not what it said. */
const noteDiff = (field: string, note: string | null): AuditDiff =>
  note ? { [field]: { from: null, to: "[redacted]" } } : {};

/**
 * Practitioner or staff accepts a pending request. If the request moves an
 * existing appointment, the old one is cancelled in the same transaction, so the
 * patient never holds both times or neither. If the old one is already gone
 * (cancelled meanwhile, or its time has passed), the request just stands alone.
 */
export function approve(viewer: ActingViewer, id: string, now = new Date()) {
  return changeStatus(viewer, id, "approve", now, (current) => ({
    set: { status: "confirmed" },
    event: "confirmed",
    note: null,
    auditAction: "appointment.confirm",
    diff: { status: { from: "pending", to: "confirmed" } },
    after: current.rescheduledFromId
      ? (tx) => replaceOld(tx, current.rescheduledFromId!, viewer.userId, viewer.role, now)
      : undefined,
  }));
}

/** Practitioner or staff turns down a pending request, with an optional note to the patient. */
export async function decline(viewer: ActingViewer, id: string, noteInput: unknown, now = new Date()): Promise<Result> {
  const note = cleanNote(noteInput);
  if (!note.ok) return { ok: false, error: "note" };
  return changeStatus(viewer, id, "decline", now, () => ({
    set: { status: "declined", declineNote: note.value },
    event: "declined",
    note: note.value,
    auditAction: "appointment.decline",
    diff: { status: { from: "pending", to: "declined" }, ...noteDiff("declineNote", note.value) },
  }));
}

/**
 * Cancels a confirmed appointment, or withdraws a pending request (patients).
 * The clinic side must give a reason; patients may leave it blank.
 */
export async function cancel(viewer: ActingViewer, id: string, reasonInput: unknown, now = new Date()): Promise<Result> {
  const reason = cleanNote(reasonInput);
  if (!reason.ok) return { ok: false, error: "note" };
  if (cancelReasonRequired(viewer) && !reason.value) return { ok: false, error: "reason" };
  return changeStatus(viewer, id, "cancel", now, (current) => ({
    set: { status: "cancelled", cancelledBy: viewer.role, cancelReason: reason.value },
    event: "cancelled",
    note: reason.value,
    auditAction: "appointment.cancel",
    diff: { status: { from: current.status, to: "cancelled" }, ...noteDiff("cancelReason", reason.value) },
  }));
}
