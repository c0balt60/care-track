// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import * as schema from "./db/schema";
import { createPatient, findPatients, lookupPatients, patientMatching } from "./patient-lookup";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const STAFF = "11111111-1111-4111-8111-111111111111";
const DOB = "1990-04-12";

async function addPatient(name: string, dob = DOB, phone = "(518) 555-0110", withAccount = false) {
  const userId = withAccount
    ? (await db.insert(schema.users).values({ email: `${name.replace(/\W/g, "")}@test`, name, role: "patient" }).returning())[0].id
    : null;
  const [p] = await db.insert(schema.patients).values({ name, dob, phone, userId }).returning();
  return p.id;
}
const audits = () => db.select({ action: schema.auditLog.action, entityId: schema.auditLog.entityId }).from(schema.auditLog);

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // audit_log is append-only; the trigger is switched off only to reset this in-memory test DB.
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.delete(schema.auditLog);
  await db.execute(sql`alter table audit_log enable trigger user`);
  await db.delete(schema.patients);
  await db.delete(schema.users);
});

describe("findPatients", () => {
  it("finds an exact name and date of birth, ignoring case and extra spaces", async () => {
    const id = await addPatient("Jordan Lee");
    expect(await findPatients("  jordan   LEE ", DOB)).toEqual([
      { id, name: "Jordan Lee", dob: DOB, hasAccount: false, phoneLast4: "0110" },
    ]);
  });

  it("finds nothing for a partial name, a name alone, or the wrong date of birth", async () => {
    await addPatient("Jordan Lee");
    expect(await findPatients("Jordan", DOB)).toEqual([]);
    expect(await findPatients("Jordan Le", DOB)).toEqual([]);
    expect(await findPatients("%", DOB)).toEqual([]);
    expect(await findPatients("Jordan Lee", "1990-04-13")).toEqual([]);
  });

  it("shows only the last 4 digits of the phone", async () => {
    await addPatient("Jordan Lee", DOB, "+1 (518) 555-0110");
    const [found] = await findPatients("Jordan Lee", DOB);
    expect(found.phoneLast4).toBe("0110");
    expect(JSON.stringify(found)).not.toContain("555");
  });

  it("returns everyone who shares the name and date of birth, oldest record first, and says who has an account", async () => {
    const first = await addPatient("Sam Park", DOB, "555-0001");
    const second = await addPatient("Sam Park", DOB, "555-0002", true);
    expect(await findPatients("sam park", DOB)).toMatchObject([
      { id: first, hasAccount: false, phoneLast4: "0001" },
      { id: second, hasAccount: true, phoneLast4: "0002" },
    ]);
  });
});

describe("lookupPatients", () => {
  it("audits each patient it shows, and nothing when there's no match", async () => {
    const id = await addPatient("Jordan Lee");
    await lookupPatients(STAFF, "Nobody Here", DOB);
    expect(await audits()).toEqual([]);
    await lookupPatients(STAFF, "Jordan Lee", DOB);
    expect(await audits()).toEqual([{ action: "patient.lookup", entityId: id }]);
  });
});

describe("patientMatching", () => {
  it("returns the patient only if their name and date of birth still match", async () => {
    const jordan = await addPatient("Jordan Lee");
    const other = await addPatient("Alex Smith", "1978-01-17");
    expect(await patientMatching(jordan, "jordan lee", DOB)).toMatchObject({ id: jordan, userId: null });
    // Someone else's id with Jordan's details: refused.
    expect(await patientMatching(other, "Jordan Lee", DOB)).toBeNull();
    expect(await patientMatching(jordan, "Jordan Lee", "1990-01-01")).toBeNull();
  });
});

describe("createPatient", () => {
  it("creates a front-desk record with no account, audited", async () => {
    const res = await createPatient(db, STAFF, { name: "New Person", dob: DOB, phone: "555-0199" });
    expect(res).toMatchObject({ ok: true });
    if (!res.ok) return;
    const [row] = await db.select().from(schema.patients).where(eq(schema.patients.id, res.patientId));
    expect(row).toMatchObject({ name: "New Person", dob: DOB, phone: "555-0199", userId: null });
    expect(await audits()).toEqual([{ action: "patient.create", entityId: res.patientId }]);
  });

  it("refuses a duplicate of an existing name and date of birth", async () => {
    await addPatient("Jordan Lee");
    expect(await createPatient(db, STAFF, { name: "JORDAN LEE", dob: DOB, phone: "555-0199" })).toEqual({ ok: false, error: "patient_exists" });
    expect(await db.select().from(schema.patients)).toHaveLength(1);
    expect(await audits()).toEqual([]);
  });
});
