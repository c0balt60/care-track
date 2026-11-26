// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import * as schema from "./db/schema";
import { purgeExpiredData, RETENTION } from "./retention";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const YEAR = 365.25 * 24 * 3_600_000;
const ago = (years: number) => new Date(Date.now() - years * YEAR);
let practitionerId: string;
let patientId: string;

async function appointmentEnded(yearsAgo: number) {
  const endsAt = ago(yearsAgo);
  const [a] = await db
    .insert(schema.appointments)
    .values({ practitionerId, patientId, status: "completed", bookedBy: "patient", startsAt: new Date(endsAt.getTime() - 1_800_000), endsAt })
    .returning();
  await db.insert(schema.appointmentEvents).values({ appointmentId: a.id, type: "booked" });
  return a.id;
}

async function auditRowFrom(yearsAgo: number) {
  const [row] = await db.insert(schema.auditLog).values({ action: "test.row", entity: "tests", entityId: `${yearsAgo}y`, at: ago(yearsAgo) }).returning();
  return row.id;
}

const ids = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows).map((r) => r.id);

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.execute(sql`truncate audit_log, payments, appointment_events, appointments, practitioners, patients, sessions, verifications, users cascade`);
  await db.execute(sql`alter table audit_log enable trigger user`);
  const [prac] = await db
    .insert(schema.practitioners)
    .values({ name: "Dr. A", credentials: "MD", specialty: "Family medicine", city: "Troy, NY", timeZone: "UTC", slotMinutes: 30 })
    .returning();
  const [patient] = await db.insert(schema.patients).values({ name: "Pat" }).returning();
  practitionerId = prac.id;
  patientId = patient.id;
});

it("uses the same audit retention as the append-only trigger", () => {
  const migration = readFileSync("drizzle/0012_account_deletion_retention.sql", "utf8");
  expect(migration.match(/interval '(\d+) years'/)?.[1]).toBe(String(RETENTION.auditLogYears));
});

describe("purgeExpiredData", () => {
  it("deletes expired sessions and verification tokens, and keeps live ones", async () => {
    const [u] = await db.insert(schema.users).values({ email: "a@test", name: "A", role: "patient" }).returning();
    await db.insert(schema.sessions).values([
      { userId: u.id, token: "expired", expiresAt: ago(0.01) },
      { userId: u.id, token: "live", expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    await db.insert(schema.verifications).values([
      { identifier: "a@test", value: "old", expiresAt: ago(0.01) },
      { identifier: "a@test", value: "new", expiresAt: new Date(Date.now() + 86_400_000) },
    ]);

    expect(await purgeExpiredData()).toMatchObject({ sessions: 1, verifications: 1 });
    expect((await db.select().from(schema.sessions)).map((s) => s.token)).toEqual(["live"]);
    expect((await db.select().from(schema.verifications)).map((v) => v.value)).toEqual(["new"]);
  });

  it(`deletes appointments that ended over ${RETENTION.appointmentYears} years ago, with their history`, async () => {
    const old = await appointmentEnded(RETENTION.appointmentYears + 1);
    const recent = await appointmentEnded(RETENTION.appointmentYears - 1);

    expect(await purgeExpiredData()).toMatchObject({ appointments: 1 });
    expect(await ids(db.select().from(schema.appointments))).toEqual([recent]);
    expect(await db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, old))).toEqual([]);
  });

  it("keeps an old appointment that has a payment (financial records follow their own rules)", async () => {
    const paid = await appointmentEnded(RETENTION.appointmentYears + 1);
    await db.insert(schema.payments).values({ appointmentId: paid, amountCents: 5000 });

    expect(await purgeExpiredData()).toMatchObject({ appointments: 0 });
    expect(await ids(db.select().from(schema.appointments))).toEqual([paid]);
  });

  it(`deletes audit rows over ${RETENTION.auditLogYears} years old, and keeps newer ones`, async () => {
    await auditRowFrom(RETENTION.auditLogYears + 1);
    const recent = await auditRowFrom(RETENTION.auditLogYears - 1);

    expect(await purgeExpiredData()).toMatchObject({ auditRows: 1 });
    expect(await ids(db.select().from(schema.auditLog))).toEqual([recent]);
  });

  it("is safe to run again", async () => {
    await appointmentEnded(RETENTION.appointmentYears + 1);
    await purgeExpiredData();
    expect(await purgeExpiredData()).toEqual({ sessions: 0, verifications: 0, appointments: 0, auditRows: 0 });
  });
});

describe("audit_log stays append-only inside the retention period", () => {
  it(`still refuses to delete a row younger than ${RETENTION.auditLogYears} years`, async () => {
    const recent = await auditRowFrom(RETENTION.auditLogYears - 1);
    await expect(db.delete(schema.auditLog).where(eq(schema.auditLog.id, recent))).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("append-only") }),
    });
  });

  it("still refuses to update any row, however old", async () => {
    const old = await auditRowFrom(RETENTION.auditLogYears + 1);
    await expect(db.update(schema.auditLog).set({ action: "tampered" }).where(eq(schema.auditLog.id, old))).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("append-only") }),
    });
  });
});
