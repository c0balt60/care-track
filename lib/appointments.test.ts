// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approve, cancel, decline, loadAppointmentFor } from "./appointments";
import type { ReadyViewer } from "./auth";
import { db } from "./db";
import * as schema from "./db/schema";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const NOW = new Date("2030-01-07T12:00:00Z");
const TOMORROW = new Date("2030-01-08T15:00:00Z");

let patient: ReadyViewer<"patient">;
let otherPatient: ReadyViewer<"patient">;
let practitioner: ReadyViewer<"practitioner">;
let staff: ReadyViewer<"staff">;
let otherStaff: ReadyViewer<"staff">;

async function makeUser(name: string, role: (typeof schema.USER_ROLES)[number]) {
  const [u] = await db.insert(schema.users).values({ email: `${name}@test`, name, role }).returning();
  return { userId: u.id, name, email: u.email };
}

async function makeClinic(name: string) {
  const [c] = await db
    .insert(schema.clinics)
    .values({ name, address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: "America/New_York" })
    .returning();
  return c.id;
}

async function makeStaff(name: string, clinicId: string): Promise<ReadyViewer<"staff">> {
  const account = await makeUser(name, "staff");
  await db.insert(schema.clinicStaff).values({ clinicId, userId: account.userId });
  return { ...account, role: "staff", clinicId };
}

async function makePatient(name: string): Promise<ReadyViewer<"patient">> {
  const account = await makeUser(name, "patient");
  const [p] = await db.insert(schema.patients).values({ userId: account.userId, name, dob: "1990-05-01", phone: "555-0199" }).returning();
  return { ...account, role: "patient", patientId: p.id };
}

/** A fresh appointment between `patient` and `practitioner`, with its "booked" event. */
async function makeAppointment(status: "pending" | "confirmed", startsAt = TOMORROW) {
  const [a] = await db
    .insert(schema.appointments)
    .values({
      practitionerId: practitioner.practitionerId,
      patientId: patient.patientId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status,
      reason: "Check-up",
      bookedBy: "patient",
    })
    .returning();
  await db.insert(schema.appointmentEvents).values({ appointmentId: a.id, type: "booked", actorUserId: patient.userId, actorRole: "patient" });
  return a.id;
}

const statusOf = async (id: string) =>
  (await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)))[0];
const eventsOf = (id: string) =>
  db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, id));
const auditOf = (id: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const clinicId = await makeClinic("Riverside Clinic");
  const otherClinicId = await makeClinic("Hilltop Clinic");

  const account = await makeUser("Dr. Grey", "practitioner");
  const [p] = await db
    .insert(schema.practitioners)
    .values({
      userId: account.userId, clinicId, name: "Dr. Grey", credentials: "MD", specialty: "Family medicine",
      city: "Troy, NY", bookingMode: "approval", timeZone: "America/New_York", slotMinutes: 30,
    })
    .returning();
  practitioner = { ...account, role: "practitioner", practitionerId: p.id };

  patient = await makePatient("alice");
  otherPatient = await makePatient("bob");
  staff = await makeStaff("frontdesk", clinicId);
  otherStaff = await makeStaff("elsewhere", otherClinicId);
});

beforeEach(async () => {
  await db.delete(schema.appointments);
});

describe("loadAppointmentFor", () => {
  it("returns the appointment, its people, and its history in order", async () => {
    const id = await makeAppointment("pending");
    await approve(practitioner, id, NOW);

    const found = await loadAppointmentFor(patient, id);
    expect(found?.practitioner.name).toBe("Dr. Grey");
    expect(found?.clinic?.name).toBe("Riverside Clinic");
    expect(found?.events.map((e) => e.type)).toEqual(["booked", "confirmed"]);
  });

  it("is null for outsiders and for ids that aren't uuids", async () => {
    const id = await makeAppointment("confirmed");
    expect(await loadAppointmentFor(otherPatient, id)).toBeNull();
    expect(await loadAppointmentFor(otherStaff, id)).toBeNull();
    expect(await loadAppointmentFor(patient, "a1")).toBeNull();
  });
});

describe("approve", () => {
  it("confirms a pending request and records the event and audit row", async () => {
    const id = await makeAppointment("pending");
    expect(await approve(practitioner, id, NOW)).toMatchObject({ ok: true });

    expect((await statusOf(id)).status).toBe("confirmed");
    const events = await eventsOf(id);
    expect(events.at(-1)).toMatchObject({ type: "confirmed", actorUserId: practitioner.userId, actorRole: "practitioner" });
    expect(await auditOf(id)).toMatchObject([
      { actorId: practitioner.userId, action: "appointment.confirm", diff: { status: { from: "pending", to: "confirmed" } } },
    ]);
  });

  it("staff at the practitioner's clinic can approve", async () => {
    const id = await makeAppointment("pending");
    expect(await approve(staff, id, NOW)).toMatchObject({ ok: true });
  });

  it("the patient can't approve their own request", async () => {
    const id = await makeAppointment("pending");
    expect(await approve(patient, id, NOW)).toEqual({ ok: false, error: "forbidden" });
    expect((await statusOf(id)).status).toBe("pending");
  });

  it("outsiders get not_found, which doesn't reveal the appointment exists", async () => {
    const id = await makeAppointment("pending");
    expect(await approve(otherStaff, id, NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await approve(practitioner, "not-a-uuid", NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("can't approve once the appointment has started", async () => {
    const id = await makeAppointment("pending", NOW);
    expect(await approve(practitioner, id, NOW)).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("decline", () => {
  it("saves the note, but the audit log only says a note was given", async () => {
    const id = await makeAppointment("pending");
    expect(await decline(practitioner, id, "  Fully booked that week  ", NOW)).toMatchObject({ ok: true });

    const a = await statusOf(id);
    expect(a.status).toBe("declined");
    expect(a.declineNote).toBe("Fully booked that week");
    expect((await eventsOf(id)).at(-1)?.note).toBe("Fully booked that week");
    const [row] = await auditOf(id);
    expect(row.diff).toEqual({ status: { from: "pending", to: "declined" }, declineNote: { from: null, to: "[redacted]" } });
  });

  it("the note is optional", async () => {
    const id = await makeAppointment("pending");
    expect(await decline(staff, id, "", NOW)).toMatchObject({ ok: true });
    expect((await statusOf(id)).declineNote).toBeNull();
  });

  it("rejects a note over 1,000 characters", async () => {
    const id = await makeAppointment("pending");
    expect(await decline(practitioner, id, "x".repeat(1001), NOW)).toEqual({ ok: false, error: "note" });
  });
});

describe("cancel", () => {
  it("the patient can withdraw a pending request without a reason", async () => {
    const id = await makeAppointment("pending");
    expect(await cancel(patient, id, "", NOW)).toMatchObject({ ok: true });
    expect(await statusOf(id)).toMatchObject({ status: "cancelled", cancelledBy: "patient", cancelReason: null });
  });

  it("the practitioner must give a reason", async () => {
    const id = await makeAppointment("confirmed");
    expect(await cancel(practitioner, id, "   ", NOW)).toEqual({ ok: false, error: "reason" });
    expect(await cancel(practitioner, id, "Out sick", NOW)).toMatchObject({ ok: true });
    expect(await statusOf(id)).toMatchObject({ status: "cancelled", cancelledBy: "practitioner", cancelReason: "Out sick" });
  });

  it("staff cancelling are recorded as staff", async () => {
    const id = await makeAppointment("confirmed");
    expect(await cancel(staff, id, "Clinic closed for weather", NOW)).toMatchObject({ ok: true });
    expect((await statusOf(id)).cancelledBy).toBe("staff");
    expect((await auditOf(id))[0].diff).toMatchObject({ status: { from: "confirmed", to: "cancelled" } });
  });

  it("reports what the appointment was before, so the page says withdrawn vs. cancelled correctly", async () => {
    // The request is approved after the patient's page loaded but before they clicked.
    const id = await makeAppointment("pending");
    await approve(practitioner, id, NOW);
    expect(await cancel(patient, id, "", NOW)).toEqual({ ok: true, from: "confirmed" });

    const pendingId = await makeAppointment("pending", new Date(TOMORROW.getTime() + 3_600_000));
    expect(await cancel(patient, pendingId, "", NOW)).toEqual({ ok: true, from: "pending" });
  });

  it("a cancelled appointment can't be cancelled again", async () => {
    const id = await makeAppointment("confirmed");
    await cancel(patient, id, "", NOW);
    expect(await cancel(practitioner, id, "Again", NOW)).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("two people acting at once", () => {
  // Approve and decline can't both happen to one request. (Approve vs. patient
  // cancel isn't a conflict: cancelling a confirmed appointment is allowed.)
  it("exactly one change wins, and only the winner's event and audit row are written", async () => {
    const id = await makeAppointment("pending");
    const results = await Promise.all([approve(practitioner, id, NOW), decline(staff, id, "", NOW)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    // Depending on timing, the loser either saw the new status when it read
    // (forbidden) or lost at the UPDATE ... AND status = ... (stale).
    const loser = results.find((r) => !r.ok) as { ok: false; error: string };
    expect(["stale", "forbidden"]).toContain(loser.error);
    expect((await eventsOf(id)).filter((e) => e.type !== "booked")).toHaveLength(1);
    expect(await auditOf(id)).toHaveLength(1);
  });
});
