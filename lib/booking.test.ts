// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bookSlot, loadBookableSlot, slotIdFor } from "./booking";
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

describe("loadBookableSlot", () => {
  it("marks a slot as taken once it's booked", async () => {
    const id = slotIdFor(instant, TEN);
    expect(await loadBookableSlot(id, NOW)).toMatchObject({ taken: false });
    await book(alice, instant, TEN);
    expect(await loadBookableSlot(id, NOW)).toMatchObject({ taken: true });
    expect(await loadBookableSlot(slotIdFor(instant, TEN_THIRTY), NOW)).toMatchObject({ taken: false });
  });
});