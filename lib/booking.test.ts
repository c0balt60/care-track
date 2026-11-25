// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approve, cancel, decline, loadAppointmentFor } from "./appointments";
import type { ReadyViewer } from "./auth";
import { BOOKING_LIMITS, bookingErrors, bookSlot, isPendingMoveClash, loadBookableSlot, slotIdFor } from "./booking";
import { db } from "./db";
import * as schema from "./db/schema";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

// Monday 2030-01-07, 7:00 in New York. Slots below are 10:00 and 10:30 New York time.
const NOW = new Date("2030-01-07T12:00:00Z");
const TEN = new Date("2030-01-07T15:00:00Z");
const TEN_THIRTY = new Date("2030-01-07T15:30:00Z");

let instant: string;
let approval: string;
let alice: { userId: string; patientId: string };
let bob: { userId: string; patientId: string };

async function makePatient(name: string) {
  const [user] = await db.insert(schema.users).values({ email: `${name}@test`, name, role: "patient" }).returning();
  const [patient] = await db.insert(schema.patients).values({ userId: user.id, name }).returning();
  return { userId: user.id, patientId: patient.id };
}

async function makePractitioner(bookingMode: "instant" | "approval") {
  const [p] = await db
    .insert(schema.practitioners)
    .values({ name: bookingMode, credentials: "MD", specialty: "Family medicine", city: "Troy, NY", bookingMode, timeZone: "America/New_York", slotMinutes: 30 })
    .returning();
  // Open 9:00–17:00 every day.
  await db
    .insert(schema.availabilityRules)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ practitionerId: p.id, weekday, startTime: "09:00", endTime: "17:00" })));
  return p.id;
}

const book = (who: typeof alice, practitionerId: string, start: Date, reason = "Check-up") =>
  bookSlot(who, slotIdFor(practitionerId, start), reason, NOW);

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  instant = await makePractitioner("instant");
  approval = await makePractitioner("approval");
  alice = await makePatient("alice");
  bob = await makePatient("bob");
});

beforeEach(async () => {
  await db.delete(schema.appointments);
});

describe("bookSlot", () => {
  it("confirms right away in instant mode", async () => {
    const res = await book(alice, instant, TEN);
    expect(res).toMatchObject({ ok: true, status: "confirmed" });

    const [appt] = await db.select().from(schema.appointments);
    expect(appt).toMatchObject({ patientId: alice.patientId, status: "confirmed", bookedBy: "patient", reason: "Check-up" });
    expect(appt.startsAt).toEqual(TEN);
    expect(appt.endsAt).toEqual(TEN_THIRTY);

    const events = await db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, appt.id));
    expect(events.map((e) => e.type).sort()).toEqual(["booked", "confirmed"]);
  });

  it("shows the history in the order it happened, though both events share a timestamp", async () => {
    const res = await book(alice, instant, TEN);
    if (!res.ok) throw new Error("booking failed");
    const viewer: ReadyViewer = { userId: alice.userId, name: "alice", email: "alice@test", role: "patient", patientId: alice.patientId };

    const found = await loadAppointmentFor(viewer, res.appointmentId);
    const [booked, confirmed] = found!.events;
    expect(booked.at).toEqual(confirmed.at); // same transaction, same now()
    expect(found!.events.map((e) => e.type)).toEqual(["booked", "confirmed"]); // not sorted: real order
  });

  it("creates a pending request in approval mode", async () => {
    expect(await book(alice, approval, TEN)).toMatchObject({ ok: true, status: "pending" });
    const [appt] = await db.select().from(schema.appointments);
    expect(appt.status).toBe("pending");
  });

  it("writes an audit row for the booking", async () => {
    const res = await book(alice, instant, TEN);
    if (!res.ok) throw new Error("booking failed");
    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, res.appointmentId));
    expect(rows).toMatchObject([{ actorId: alice.userId, action: "appointment.book", entity: "appointments" }]);
  });

  describe("double booking", () => {
    it("returns a friendly error, not a crash, when the slot is already booked", async () => {
      expect(await book(alice, instant, TEN)).toMatchObject({ ok: true });
      expect(await book(bob, instant, TEN)).toEqual({ ok: false, error: "taken" });
      expect(await db.select().from(schema.appointments)).toHaveLength(1);
    });

    it("also blocks a pending request on a slot someone else requested", async () => {
      expect(await book(alice, approval, TEN)).toMatchObject({ ok: true });
      expect(await book(bob, approval, TEN)).toEqual({ ok: false, error: "taken" });
    });

    it("lets exactly one of two simultaneous bookings win", async () => {
      const results = await Promise.all([book(alice, instant, TEN), book(bob, instant, TEN)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "taken" }]);
    });

    it("frees the slot again once the booking is cancelled", async () => {
      await book(alice, instant, TEN);
      await db.update(schema.appointments).set({ status: "cancelled" });
      expect(await book(bob, instant, TEN)).toMatchObject({ ok: true });
    });
  });

  describe("rejects bad input", () => {
    it.each([
      ["a slot in the past", () => book(alice, instant, new Date("2030-01-07T11:00:00Z"))],
      ["a time outside opening hours", () => book(alice, instant, new Date("2030-01-07T03:00:00Z"))],
      ["a time that isn't on the slot grid", () => book(alice, instant, new Date("2030-01-07T15:10:00Z"))],
      ["a time past the booking window", () => book(alice, instant, new Date("2030-03-01T15:00:00Z"))],
      ["an unknown practitioner", () => book(alice, "00000000-0000-4000-8000-000000000000", TEN)],
      ["a mock-style slot id", () => bookSlot(alice, "rivera_1893322800000", "Check-up", NOW)],
      ["junk", () => bookSlot(alice, "'; drop table appointments;--", "Check-up", NOW)],
    ])("%s", async (_, run) => {
      expect(await run()).toEqual({ ok: false, error: "slot" });
    });

    it.each([["empty", "   "], ["too long", "x".repeat(1001)]])("a reason that's %s", async (_, reason) => {
      expect(await book(alice, instant, TEN, reason)).toEqual({ ok: false, error: "reason" });
    });
  });
});

describe("booking limits (SCH-8)", () => {
  const max = BOOKING_LIMITS.upcomingPerPatient;
  /** The i-th half-hour slot from 10:00 New York time. */
  const slot = (i: number) => new Date(TEN.getTime() + i * 30 * 60_000);
  const move = (practitionerId: string, start: Date, fromId: string) =>
    bookSlot(alice, slotIdFor(practitionerId, start), "Check-up", NOW, { rescheduleFromId: fromId });
  const setStatus = (id: string, status: "confirmed" | "cancelled" | "declined") =>
    db.update(schema.appointments).set({ status }).where(eq(schema.appointments.id, id));

  /** Books alice `n` instant appointments, starting at slot `from`. */
  async function fill(n: number, from = 0) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await book(alice, instant, slot(from + i));
      if (!res.ok) throw new Error(`booking ${i} failed: ${res.error}`);
      ids.push(res.appointmentId);
    }
    return ids;
  }

  it("refuses one past the limit, with a message that says so", async () => {
    await fill(max);
    expect(await book(alice, instant, slot(max))).toEqual({ ok: false, error: "limit" });
    expect(bookingErrors.limit).toContain(`${max} upcoming appointments`);
    expect(await db.select().from(schema.appointments)).toHaveLength(max);
    // The limit is per patient: someone else can still book.
    expect(await book(bob, instant, slot(max))).toMatchObject({ ok: true });
  });

  it("doesn't count cancelled or declined appointments", async () => {
    const ids = await fill(max);
    await setStatus(ids[0], "cancelled");
    expect(await book(alice, instant, slot(max))).toMatchObject({ ok: true });
    await setStatus(ids[1], "declined");
    expect(await book(alice, instant, slot(max + 1))).toMatchObject({ ok: true });
  });

  it("doesn't count appointments that have already started", async () => {
    const past = new Date("2030-01-06T15:00:00Z");
    await db.insert(schema.appointments).values(
      Array.from({ length: max }, (_, i) => ({
        practitionerId: instant, patientId: alice.patientId, status: "confirmed" as const, bookedBy: "patient" as const,
        startsAt: new Date(past.getTime() + i * 3_600_000), endsAt: new Date(past.getTime() + i * 3_600_000 + 1_800_000),
      })),
    );
    expect(await book(alice, instant, TEN)).toMatchObject({ ok: true });
  });

  it("allows one waiting request per practitioner, and another once it's answered", async () => {
    const first = await book(alice, approval, slot(0));
    expect(first).toMatchObject({ ok: true, status: "pending" });
    expect(await book(alice, approval, slot(1))).toEqual({ ok: false, error: "pending_exists" });
    // A different practitioner is fine.
    expect(await book(alice, instant, slot(2))).toMatchObject({ ok: true });
    if (!first.ok) return;
    await setStatus(first.appointmentId, "declined");
    expect(await book(alice, approval, slot(1))).toMatchObject({ ok: true, status: "pending" });
  });

  it("doesn't count an instant-mode reschedule as another booking", async () => {
    const ids = await fill(max);
    expect(await move(instant, slot(max), ids[0])).toMatchObject({ ok: true, status: "confirmed" });
    expect(await book(alice, instant, slot(max + 1))).toEqual({ ok: false, error: "limit" }); // still at the limit
  });

  it("doesn't count an approval-mode move request, for the limit or for the one-request rule", async () => {
    const res = await book(alice, approval, slot(0));
    if (!res.ok) throw new Error("booking failed");
    await setStatus(res.appointmentId, "confirmed");
    const others = await fill(max - 1, 1); // at the limit now

    // Moving is allowed at the limit: it replaces an appointment.
    expect(await move(approval, slot(max), res.appointmentId)).toMatchObject({ ok: true, status: "pending" });

    // One below the limit again. If the move request counted, this would hit the limit, or the
    // one-request rule for this practitioner. It does neither.
    await setStatus(others[0], "cancelled");
    expect(await book(alice, approval, slot(max + 1))).toMatchObject({ ok: true, status: "pending" });
  });
});

describe("staff booking for a patient (SCH-6)", () => {
  let atClinic: string;
  let staff: { userId: string; clinicId: string };
  const slot = (i: number) => new Date(TEN.getTime() + i * 30 * 60_000);
  const staffBook = (patient: { patientId: string; userId: string | null }, practitionerId: string, start: Date, extra = {}) =>
    bookSlot(patient, slotIdFor(practitionerId, start), "Check-up", NOW, { staff, ...extra });

  beforeAll(async () => {
    const [clinic] = await db
      .insert(schema.clinics)
      .values({ name: "Front Desk Clinic", address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: "America/New_York" })
      .returning();
    atClinic = await makePractitioner("approval");
    await db.update(schema.practitioners).set({ clinicId: clinic.id }).where(eq(schema.practitioners.id, atClinic));
    const [u] = await db.insert(schema.users).values({ email: "desk@test", name: "Desk", role: "staff" }).returning();
    staff = { userId: u.id, clinicId: clinic.id };
  });

  it("confirms right away, even in approval mode, and records who booked", async () => {
    const res = await staffBook(alice, atClinic, TEN);
    expect(res).toMatchObject({ ok: true, status: "confirmed" });
    if (!res.ok) return;

    const [appt] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, res.appointmentId));
    expect(appt).toMatchObject({ patientId: alice.patientId, status: "confirmed", bookedBy: "staff" });
    const events = await db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, appt.id));
    expect(events.map(({ type, actorUserId, actorRole }) => ({ type, actorUserId, actorRole })).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: "booked", actorUserId: staff.userId, actorRole: "staff" },
      { type: "confirmed", actorUserId: staff.userId, actorRole: "staff" },
    ]);
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, appt.id));
    expect(audits).toMatchObject([{ actorId: staff.userId, action: "appointment.book", diff: { bookedBy: { from: null, to: "staff" } } }]);
  });

  it("books for a patient with no account", async () => {
    const [walkIn] = await db.insert(schema.patients).values({ name: "Walk In", userId: null }).returning();
    expect(await staffBook({ patientId: walkIn.id, userId: null }, atClinic, TEN)).toMatchObject({ ok: true, status: "confirmed" });
  });

  it("only books for practitioners at the staff member's clinic", async () => {
    expect(await staffBook(alice, approval, TEN)).toEqual({ ok: false, error: "clinic" }); // `approval` has no clinic
    expect(await db.select().from(schema.appointments)).toHaveLength(0);
  });

  it("isn't held to the patient limits", async () => {
    for (let i = 0; i <= BOOKING_LIMITS.upcomingPerPatient; i++) {
      expect(await staffBook(alice, atClinic, slot(i))).toMatchObject({ ok: true });
    }
  });

  it("doesn't move appointments for the patient", async () => {
    expect(await staffBook(alice, atClinic, TEN, { rescheduleFromId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, error: "reschedule" });
  });

  it("rolls back with the caller's transaction", async () => {
    await expect(
      db.transaction(async (tx) => {
        expect(await staffBook(alice, atClinic, TEN, { tx })).toMatchObject({ ok: true });
        throw new Error("the caller gave up");
      }),
    ).rejects.toThrow("the caller gave up");
    expect(await db.select().from(schema.appointments)).toHaveLength(0);
  });
});

describe("rescheduling", () => {
  const ELEVEN = new Date("2030-01-07T16:00:00Z");
  const move = (who: typeof alice, practitionerId: string, start: Date, fromId: string) =>
    bookSlot(who, slotIdFor(practitionerId, start), "Check-up", NOW, { rescheduleFromId: fromId });
  const get = async (id: string) => (await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)))[0];
  const eventTypes = async (id: string) =>
    (await db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, id))).map((e) => e.type);

  /** A confirmed appointment for alice at 10:00 with `practitionerId`. */
  async function confirmedAtTen(practitionerId: string) {
    const res = await book(alice, practitionerId, TEN);
    if (!res.ok) throw new Error("booking failed");
    await db.update(schema.appointments).set({ status: "confirmed" }).where(eq(schema.appointments.id, res.appointmentId));
    return res.appointmentId;
  }

  let reviewer: ReadyViewer<"practitioner">;
  beforeAll(async () => {
    const [u] = await db.insert(schema.users).values({ email: "reviewer@test", name: "reviewer", role: "practitioner" }).returning();
    reviewer = { userId: u.id, name: u.name, email: u.email, role: "practitioner", practitionerId: approval };
  });

  describe("instant mode", () => {
    it("cancels the old appointment and confirms the new one together", async () => {
      const oldId = await confirmedAtTen(instant);
      const res = await move(alice, instant, ELEVEN, oldId);
      expect(res).toMatchObject({ ok: true, status: "confirmed" });
      if (!res.ok) return;

      expect(await get(oldId)).toMatchObject({ status: "cancelled", cancelledBy: "patient", cancelReason: "Rescheduled" });
      expect(await get(res.appointmentId)).toMatchObject({ status: "confirmed", rescheduledFromId: oldId });
      expect(await eventTypes(oldId)).toContain("rescheduled");
      const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, oldId));
      expect(audits.map((r) => r.action)).toContain("appointment.reschedule");
    });

    it("can move into the next slot, right after the old time", async () => {
      const oldId = await confirmedAtTen(instant);
      expect(await move(alice, instant, TEN_THIRTY, oldId)).toMatchObject({ ok: true });
    });

    it("keeps the old appointment if the new time is taken", async () => {
      const oldId = await confirmedAtTen(instant);
      await book(bob, instant, ELEVEN);
      expect(await move(alice, instant, ELEVEN, oldId)).toEqual({ ok: false, error: "taken" });
      // The whole transaction rolled back, including cancelling the old one.
      expect((await get(oldId)).status).toBe("confirmed");
      expect(await eventTypes(oldId)).not.toContain("rescheduled");
    });
  });

  describe("approval mode", () => {
    it("sends a request and keeps the old time until it's accepted", async () => {
      const oldId = await confirmedAtTen(approval);
      const res = await move(alice, approval, ELEVEN, oldId);
      expect(res).toMatchObject({ ok: true, status: "pending" });
      if (!res.ok) return;
      expect((await get(oldId)).status).toBe("confirmed");

      expect(await approve(reviewer, res.appointmentId, NOW)).toMatchObject({ ok: true });
      expect((await get(res.appointmentId)).status).toBe("confirmed");
      expect(await get(oldId)).toMatchObject({ status: "cancelled", cancelReason: "Rescheduled" });
      expect(await eventTypes(oldId)).toContain("rescheduled");
    });

    it("a declined request leaves the old appointment booked", async () => {
      const oldId = await confirmedAtTen(approval);
      const res = await move(alice, approval, ELEVEN, oldId);
      if (!res.ok) throw new Error("move failed");
      expect(await decline(reviewer, res.appointmentId, "", NOW)).toMatchObject({ ok: true });
      expect((await get(oldId)).status).toBe("confirmed");
    });

    it("allows only one waiting move request per appointment", async () => {
      const oldId = await confirmedAtTen(approval);
      expect(await move(alice, approval, ELEVEN, oldId)).toMatchObject({ ok: true });
      expect(await move(alice, approval, TEN_THIRTY, oldId)).toEqual({ ok: false, error: "reschedule_pending" });
    });

    it("the database itself refuses a second waiting move request", async () => {
      // This is what saves us when two requests both pass checkReschedule at the
      // same moment (PGlite runs transactions one at a time, so we insert directly).
      const oldId = await confirmedAtTen(approval);
      const res = await move(alice, approval, ELEVEN, oldId);
      if (!res.ok) throw new Error("move failed");

      const second = db.insert(schema.appointments).values({
        practitionerId: approval, patientId: alice.patientId, startsAt: TEN_THIRTY,
        endsAt: new Date(TEN_THIRTY.getTime() + 30 * 60_000), status: "pending", bookedBy: "patient",
        rescheduledFromId: oldId,
      });
      const err = await second.then(() => null, (e: unknown) => e);
      expect(err).not.toBeNull();
      // ...and bookSlot() recognizes that error, so the patient sees the friendly message.
      expect(isPendingMoveClash(err)).toBe(true);
    });

    it("approving still works if the clinic cancelled the old one meanwhile", async () => {
      const oldId = await confirmedAtTen(approval);
      const res = await move(alice, approval, ELEVEN, oldId);
      if (!res.ok) throw new Error("move failed");
      expect(await cancel(reviewer, oldId, "Running late today", NOW)).toMatchObject({ ok: true });

      expect(await approve(reviewer, res.appointmentId, NOW)).toMatchObject({ ok: true });
      // The old one keeps the clinic's cancellation; it isn't overwritten as "Rescheduled".
      expect(await get(oldId)).toMatchObject({ status: "cancelled", cancelledBy: "practitioner", cancelReason: "Running late today" });
    });
  });

  describe("refuses", () => {
    it("someone else's appointment", async () => {
      const oldId = await confirmedAtTen(instant);
      expect(await move(bob, instant, ELEVEN, oldId)).toEqual({ ok: false, error: "reschedule" });
      expect((await get(oldId)).status).toBe("confirmed");
    });

    it("a pending appointment (withdraw it instead)", async () => {
      const res = await book(alice, approval, TEN);
      if (!res.ok) throw new Error("booking failed");
      expect(await move(alice, approval, ELEVEN, res.appointmentId)).toEqual({ ok: false, error: "reschedule" });
    });

    it("moving to a different practitioner", async () => {
      const oldId = await confirmedAtTen(instant);
      expect(await move(alice, approval, ELEVEN, oldId)).toEqual({ ok: false, error: "reschedule" });
    });

    it("an id that isn't a uuid", async () => {
      expect(await move(alice, instant, ELEVEN, "a1")).toEqual({ ok: false, error: "reschedule" });
    });
  });
});

describe("loadBookableSlot", () => {
  it("marks a slot as taken once it's booked", async () => {
    const id = slotIdFor(instant, TEN);
    expect(await loadBookableSlot(id, NOW)).toMatchObject({ taken: false });
    await book(alice, instant, TEN);
    expect(await loadBookableSlot(id, NOW)).toMatchObject({ taken: true });
    expect(await loadBookableSlot(slotIdFor(instant, TEN_THIRTY), NOW)).toMatchObject({ taken: false });
  });
});