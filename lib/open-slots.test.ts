// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_WINDOW_DAYS, loadBookableSlot } from "./booking";
import { addDays, dayKey } from "./dates";
import { db } from "./db";
import * as schema from "./db/schema";
import { openSlotsFor, soonest, type SlotPractitioner } from "./open-slots";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const NY = "America/New_York";
// Monday 2030-01-07, 10:10 in New York.
const NOW = new Date("2030-01-07T15:10:00Z");
const at = (iso: string) => new Date(iso);
const iso = (slots: { start: Date }[]) => slots.map((s) => s.start.toISOString());

let patientId: string;

/** A practitioner with the given weekly hours (every day 9:00–17:00 by default). */
async function makePractitioner(
  timeZone = NY,
  hours: { weekday: number; startTime: string; endTime: string }[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "17:00",
  })),
): Promise<SlotPractitioner> {
  const [p] = await db
    .insert(schema.practitioners)
    .values({ name: "Dr. Test", credentials: "MD", specialty: "Family medicine", city: "Troy, NY", timeZone, slotMinutes: 30 })
    .returning();
  if (hours.length) await db.insert(schema.availabilityRules).values(hours.map((h) => ({ ...h, practitionerId: p.id })));
  return p;
}

async function book(p: SlotPractitioner, startsAt: Date, minutes = 30, status: (typeof schema.APPOINTMENT_STATUSES)[number] = "confirmed") {
  await db.insert(schema.appointments).values({
    practitionerId: p.id,
    patientId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    status,
    reason: "Check-up",
    bookedBy: "patient",
  });
}

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const [user] = await db.insert(schema.users).values({ email: "alice@test", name: "alice", role: "patient" }).returning();
  const [patient] = await db.insert(schema.patients).values({ userId: user.id, name: "alice" }).returning();
  patientId = patient.id;
});

beforeEach(async () => {
  await db.delete(schema.appointments);
});

describe("openSlotsFor", () => {
  it("returns an entry for every practitioner, empty when they have no hours", async () => {
    const open = await makePractitioner();
    const closed = await makePractitioner(NY, []);
    const slots = await openSlotsFor([open, closed], { now: NOW });
    expect([...slots.keys()]).toEqual([open.id, closed.id]);
    expect(slots.get(open.id)!.length).toBeGreaterThan(0);
    expect(slots.get(closed.id)).toEqual([]);
  });

  it("returns an empty map for an empty list without querying", async () => {
    expect((await openSlotsFor([])).size).toBe(0);
  });

  it("starts after now: at 10:10 the first slot is 10:30", async () => {
    const p = await makePractitioner();
    const slots = (await openSlotsFor([p], { now: NOW })).get(p.id)!;
    expect(slots[0].start).toEqual(at("2030-01-07T15:30:00Z"));
    expect(soonest(slots)).toBe(at("2030-01-07T15:30:00Z").getTime());
  });

  it("drops slots a live appointment overlaps, even partly", async () => {
    const p = await makePractitioner();
    await book(p, at("2030-01-07T16:00:00Z"), 45); // 11:00–11:45 blocks 11:00 and 11:30
    await book(p, at("2030-01-07T17:00:00Z"), 30, "pending"); // a request holds its time too
    const slots = (await openSlotsFor([p], { now: NOW })).get(p.id)!;
    expect(iso(slots).slice(0, 3)).toEqual([
      "2030-01-07T15:30:00.000Z", // 10:30
      "2030-01-07T17:30:00.000Z", // 12:30
      "2030-01-07T18:00:00.000Z", // 13:00
    ]);
  });

  it("keeps slots whose appointment was cancelled or declined", async () => {
    const p = await makePractitioner();
    await book(p, at("2030-01-07T15:30:00Z"), 30, "cancelled");
    await book(p, at("2030-01-07T16:00:00Z"), 30, "declined");
    const slots = (await openSlotsFor([p], { now: NOW })).get(p.id)!;
    expect(iso(slots).slice(0, 2)).toEqual(["2030-01-07T15:30:00.000Z", "2030-01-07T16:00:00.000Z"]);
  });

  it("applies date exceptions: closed days and extra hours", async () => {
    const p = await makePractitioner();
    await db.insert(schema.availabilityExceptions).values([
      { practitionerId: p.id, date: "2030-01-08" }, // closed all Tuesday
      { practitionerId: p.id, date: "2030-01-09", startTime: "18:00", endTime: "19:00" }, // Wednesday evening only
    ]);
    const slots = (await openSlotsFor([p], { now: NOW })).get(p.id)!;
    const days = slots.map((s) => dayKey(s.start, NY));
    expect(days).not.toContain("2030-01-08");
    expect(iso(slots.filter((s) => dayKey(s.start, NY) === "2030-01-09"))).toEqual([
      "2030-01-09T23:00:00.000Z",
      "2030-01-09T23:30:00.000Z",
    ]);
  });

  it("stays inside the booking window, and `days` can shorten it but not lengthen it", async () => {
    const p = await makePractitioner();
    const lastDay = (s: { start: Date }[]) => dayKey(s.at(-1)!.start, NY);

    expect(lastDay((await openSlotsFor([p], { now: NOW })).get(p.id)!)).toBe(addDays("2030-01-07", BOOKING_WINDOW_DAYS - 1));
    expect(lastDay((await openSlotsFor([p], { now: NOW, days: 7 })).get(p.id)!)).toBe("2030-01-13");
    expect(lastDay((await openSlotsFor([p], { now: NOW, days: 90 })).get(p.id)!)).toBe(addDays("2030-01-07", BOOKING_WINDOW_DAYS - 1));
  });

  it("uses each practitioner's own 'today', ahead of or behind UTC", async () => {
    // At 2030-01-07 05:00 UTC it is Jan 7 14:00 in Tokyo and Jan 6 19:00 in Honolulu.
    const now = at("2030-01-07T05:00:00Z");
    const tokyo = await makePractitioner("Asia/Tokyo", []);
    const honolulu = await makePractitioner("Pacific/Honolulu", []);
    await db.insert(schema.availabilityExceptions).values([
      // Tokyo's window is Jan 7 – Feb 3, Honolulu's is Jan 6 – Feb 2.
      { practitionerId: tokyo.id, date: "2030-02-03", startTime: "10:00", endTime: "10:30" }, // last day: in
      { practitionerId: tokyo.id, date: "2030-02-04", startTime: "10:00", endTime: "10:30" }, // day after: out
      { practitionerId: honolulu.id, date: "2030-01-06", startTime: "20:00", endTime: "20:30" }, // still "today" there: in
    ]);
    const slots = await openSlotsFor([tokyo, honolulu], { now });
    expect(slots.get(tokyo.id)!.map((s) => dayKey(s.start, "Asia/Tokyo"))).toEqual(["2030-02-03"]);
    expect(slots.get(honolulu.id)!.map((s) => dayKey(s.start, "Pacific/Honolulu"))).toEqual(["2030-01-06"]);
  });

  it("matches appointments to slots correctly across a daylight-saving change", async () => {
    // US clocks spring forward on Sunday 2030-03-10: 10:00 is 15:00 UTC the day before, 14:00 UTC that day.
    const now = at("2030-03-09T12:00:00Z");
    const p = await makePractitioner();
    await book(p, at("2030-03-10T14:00:00Z")); // 10:00 EDT
    const sunday = (await openSlotsFor([p], { now })).get(p.id)!.filter((s) => dayKey(s.start, NY) === "2030-03-10");
    expect(iso(sunday).slice(0, 3)).toEqual([
      "2030-03-10T13:00:00.000Z", // 9:00 EDT
      "2030-03-10T13:30:00.000Z", // 9:30 EDT
      "2030-03-10T14:30:00.000Z", // 10:30 EDT (10:00 is booked)
    ]);
  });

  it("gives ids that /book/[slotId] accepts", async () => {
    const p = await makePractitioner();
    await db.insert(schema.availabilityExceptions).values({ practitionerId: p.id, date: "2030-01-10" });
    const slots = (await openSlotsFor([p], { now: NOW })).get(p.id)!;
    for (const s of [slots[0], slots[Math.floor(slots.length / 2)], slots.at(-1)!]) {
      const found = await loadBookableSlot(s.id, NOW);
      expect(found).toMatchObject({ taken: false, slot: { start: s.start, end: s.end } });
    }
  });
});
