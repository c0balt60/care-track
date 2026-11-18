// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listAppointmentsFor, practitionersAt } from "./appointment-lists";
import { involves } from "./appointment-rules";
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

const DAY1 = new Date("2030-01-08T15:00:00Z");
const DAY2 = new Date("2030-01-09T15:00:00Z");
const DAY3 = new Date("2030-01-10T15:00:00Z");

let alice: ReadyViewer<"patient">;
let bob: ReadyViewer<"patient">;
let grey: ReadyViewer<"practitioner">; // Riverside
let house: ReadyViewer<"practitioner">; // Riverside
let wilson: ReadyViewer<"practitioner">; // Hilltop
let riversideStaff: ReadyViewer<"staff">;
let hilltopStaff: ReadyViewer<"staff">;
const admin: ReadyViewer<"admin"> = { userId: "00000000-0000-0000-0000-000000000000", name: "Admin", email: "admin@test", role: "admin" };

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

async function makePractitioner(name: string, clinicId: string): Promise<ReadyViewer<"practitioner">> {
  const account = await makeUser(name, "practitioner");
  const [p] = await db
    .insert(schema.practitioners)
    .values({
      userId: account.userId, clinicId, name, credentials: "MD", specialty: "Family medicine",
      city: "Troy, NY", bookingMode: "approval", timeZone: "America/New_York", slotMinutes: 30,
    })
    .returning();
  return { ...account, role: "practitioner", practitionerId: p.id };
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

async function book(
  patient: ReadyViewer<"patient">,
  practitioner: ReadyViewer<"practitioner">,
  startsAt: Date,
  status: (typeof schema.APPOINTMENT_STATUSES)[number] = "confirmed",
) {
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
  return a.id;
}

const ids = (rows: { appointment: { id: string } }[]) => rows.map((r) => r.appointment.id);

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const riverside = await makeClinic("Riverside Clinic");
  const hilltop = await makeClinic("Hilltop Clinic");
  grey = await makePractitioner("Dr. Grey", riverside);
  house = await makePractitioner("Dr. House", riverside);
  wilson = await makePractitioner("Dr. Wilson", hilltop);
  riversideStaff = await makeStaff("riverside-desk", riverside);
  hilltopStaff = await makeStaff("hilltop-desk", hilltop);
  alice = await makePatient("alice");
  bob = await makePatient("bob");
});

beforeEach(async () => {
  await db.delete(schema.appointments);
});

describe("listAppointmentsFor: who sees what", () => {
  let aliceGrey: string, bobHouse: string, aliceWilson: string;

  beforeEach(async () => {
    aliceGrey = await book(alice, grey, DAY1);
    bobHouse = await book(bob, house, DAY2);
    aliceWilson = await book(alice, wilson, DAY3);
  });

  it("patients see only their own appointments", async () => {
    expect(ids(await listAppointmentsFor(alice))).toEqual([aliceGrey, aliceWilson]);
    expect(ids(await listAppointmentsFor(bob))).toEqual([bobHouse]);
  });

  it("practitioners see only appointments with them", async () => {
    expect(ids(await listAppointmentsFor(grey))).toEqual([aliceGrey]);
    expect(ids(await listAppointmentsFor(wilson))).toEqual([aliceWilson]);
  });

  it("staff see every practitioner at their clinic, and no other clinic", async () => {
    expect(ids(await listAppointmentsFor(riversideStaff))).toEqual([aliceGrey, bobHouse]);
    expect(ids(await listAppointmentsFor(hilltopStaff))).toEqual([aliceWilson]);
  });

  it("staff can narrow to one practitioner, but not reach into another clinic", async () => {
    expect(ids(await listAppointmentsFor(riversideStaff, { practitionerId: house.practitionerId }))).toEqual([bobHouse]);
    expect(await listAppointmentsFor(riversideStaff, { practitionerId: wilson.practitionerId })).toEqual([]);
  });

  it("practitionerId is ignored for roles other than staff", async () => {
    expect(ids(await listAppointmentsFor(grey, { practitionerId: house.practitionerId }))).toEqual([aliceGrey]);
  });

  it("admins see nothing", async () => {
    expect(await listAppointmentsFor(admin)).toEqual([]);
  });

  it("agrees with involves() for every viewer and appointment", async () => {
    const all = await db
      .select({ a: schema.appointments, clinicId: schema.practitioners.clinicId })
      .from(schema.appointments)
      .innerJoin(schema.practitioners, eq(schema.practitioners.id, schema.appointments.practitionerId));
    for (const viewer of [alice, bob, grey, house, wilson, riversideStaff, hilltopStaff, admin]) {
      const expected = all.filter((r) => involves(viewer, { ...r.a, clinicId: r.clinicId })).map((r) => r.a.id).sort();
      expect(ids(await listAppointmentsFor(viewer)).sort()).toEqual(expected);
    }
  });
});

describe("listAppointmentsFor: filters and shape", () => {
  it("filters by time range: from is inclusive, to is exclusive", async () => {
    await book(alice, grey, DAY1);
    const day2 = await book(alice, grey, DAY2);
    await book(alice, grey, DAY3);
    expect(ids(await listAppointmentsFor(alice, { from: DAY2, to: DAY3 }))).toEqual([day2]);
  });

  it("filters by status; an empty status list matches nothing", async () => {
    const pending = await book(alice, grey, DAY1, "pending");
    await book(alice, grey, DAY2, "confirmed");
    expect(ids(await listAppointmentsFor(alice, { statuses: ["pending"] }))).toEqual([pending]);
    expect(await listAppointmentsFor(alice, { statuses: [] })).toEqual([]);
  });

  it("returns earliest first, with names and clinic but no date of birth or phone", async () => {
    const later = await book(alice, grey, DAY2);
    const earlier = await book(alice, grey, DAY1);
    const rows = await listAppointmentsFor(alice);
    expect(ids(rows)).toEqual([earlier, later]);
    expect(rows[0].practitioner.name).toBe("Dr. Grey");
    expect(rows[0].clinic?.name).toBe("Riverside Clinic");
    expect(rows[0].patient).toEqual({ id: alice.patientId, name: "alice" });
  });
});

describe("practitionersAt", () => {
  it("lists a clinic's practitioners by name, and no one else's", async () => {
    const names = (rows: { name: string }[]) => rows.map((r) => r.name);
    expect(names(await practitionersAt(riversideStaff.clinicId))).toEqual(["Dr. Grey", "Dr. House"]);
    expect(names(await practitionersAt(hilltopStaff.clinicId))).toEqual(["Dr. Wilson"]);
  });
});
