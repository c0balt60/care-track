// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listPractitionersForAdmin, setVerified } from "./admin-practitioners";
import { db } from "./db";
import * as schema from "./db/schema";
import { searchPractitioners } from "./practitioner-search";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const NOW = new Date("2030-01-07T12:00:00Z");
const ADMIN = "11111111-1111-4111-8111-111111111111";

async function makePractitioner(name: string, verified = false) {
  const [p] = await db
    .insert(schema.practitioners)
    .values({
      name, credentials: "MD", specialty: "Family medicine", city: "Troy, NY", timeZone: "America/New_York", slotMinutes: 30,
      verifiedAt: verified ? NOW : null,
    })
    .returning();
  return p.id;
}

const audits = () => db.select().from(schema.auditLog);
const verifiedAt = async (id: string) =>
  (await db.select({ v: schema.practitioners.verifiedAt }).from(schema.practitioners).where(eq(schema.practitioners.id, id)))[0].v;

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // audit_log is append-only, so the trigger has to be switched off to reset it between tests.
  // This only touches the throwaway in-memory test database, never a real one.
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.delete(schema.auditLog);
  await db.execute(sql`alter table audit_log enable trigger user`);
  await db.delete(schema.practitioners);
});

describe("setVerified", () => {
  it("verifies, writes one audit row, and puts the practitioner in search", async () => {
    const id = await makePractitioner("Dr. New");
    expect(await searchPractitioners({ now: NOW })).toEqual([]);

    expect(await setVerified(ADMIN, id, true, NOW)).toEqual({ ok: true });

    expect(await verifiedAt(id)).toEqual(NOW);
    expect(await audits()).toMatchObject([
      { actorId: ADMIN, action: "practitioner.verify", entity: "practitioners", entityId: id, diff: { verified: { from: false, to: true } } },
    ]);
    expect((await searchPractitioners({ now: NOW })).map((r) => r.practitioner.id)).toEqual([id]);
  });

  it("unverifies, records that too, and takes them out of search", async () => {
    const id = await makePractitioner("Dr. Old", true);

    expect(await setVerified(ADMIN, id, false)).toEqual({ ok: true });

    expect(await verifiedAt(id)).toBeNull();
    expect(await audits()).toMatchObject([{ action: "practitioner.unverify", entityId: id, diff: { verified: { from: true, to: false } } }]);
    expect(await searchPractitioners({ now: NOW })).toEqual([]);
  });

  it("refuses repeats and missing or malformed ids, and writes nothing", async () => {
    const verified = await makePractitioner("Dr. Yes", true);
    const unverified = await makePractitioner("Dr. No");

    expect(await setVerified(ADMIN, verified, true)).toEqual({ ok: false, error: "no_change" });
    expect(await setVerified(ADMIN, unverified, false)).toEqual({ ok: false, error: "no_change" });
    expect(await setVerified(ADMIN, "00000000-0000-4000-8000-000000000000", true)).toEqual({ ok: false, error: "not_found" });
    expect(await setVerified(ADMIN, "not-a-uuid", true)).toEqual({ ok: false, error: "not_found" });

    expect(await verifiedAt(verified)).toEqual(NOW);
    expect(await audits()).toHaveLength(0);
  });

  it("two admins verifying at once make one change and one audit row", async () => {
    const id = await makePractitioner("Dr. Race");

    const results = await Promise.all([setVerified(ADMIN, id, true), setVerified(ADMIN, id, true)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, error: "no_change" });
    expect(await audits()).toHaveLength(1);
  });
});

describe("listPractitionersForAdmin", () => {
  it("lists unverified practitioners first, then by name, with their clinic", async () => {
    const [clinic] = await db
      .insert(schema.clinics)
      .values({ name: "Riverside Clinic", address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: "America/New_York" })
      .returning();
    await makePractitioner("Dr. Adams", true);
    await makePractitioner("Dr. Zane");
    await makePractitioner("Dr. Baker");
    await db.update(schema.practitioners).set({ clinicId: clinic.id }).where(eq(schema.practitioners.name, "Dr. Baker"));

    const rows = await listPractitionersForAdmin();

    expect(rows.map((r) => r.name)).toEqual(["Dr. Baker", "Dr. Zane", "Dr. Adams"]);
    expect(rows[0]).toMatchObject({ clinicName: "Riverside Clinic", hasAccount: false, verifiedAt: null });
    expect(rows[1].clinicName).toBeNull();
    expect(rows[2].verifiedAt).toEqual(NOW);
  });
});
