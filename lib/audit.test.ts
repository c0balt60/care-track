// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { audit, redactedDiff } from "./audit";
import { db } from "./db";
import * as schema from "./db/schema";

// Replace the app's database with an in-memory one, for audit() and for this file.
vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const ACTOR = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  // `db` is typed as the app's driver but is the PGlite one from the mock above.
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

const rowsFor = (entityId: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, entityId));

describe("audit()", () => {
  it("writes who did what to which record", async () => {
    const row = await audit(ACTOR, "appointment.cancel", "appointments", "appt-1", {
      status: { from: "confirmed", to: "cancelled" },
    });

    expect(row).toMatchObject({
      actorId: ACTOR,
      action: "appointment.cancel",
      entity: "appointments",
      entityId: "appt-1",
      diff: { status: { from: "confirmed", to: "cancelled" } },
    });
    expect(row.id).toBeTruthy();
    expect(row.at).toBeInstanceOf(Date);
    expect(await rowsFor("appt-1")).toHaveLength(1);
  });

  it("allows system actions with no actor and no diff", async () => {
    const row = await audit(null, "user.sign_in", "users", "user-1");
    expect(row).toMatchObject({ actorId: null, diff: null });
  });

  it("rolls back with the transaction it was given", async () => {
    await expect(
      db.transaction(async (tx) => {
        await audit(ACTOR, "practitioner.update", "practitioners", "prac-1", { bio: { from: "a", to: "b" } }, tx);
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");

    expect(await rowsFor("prac-1")).toHaveLength(0);
  });
});

describe("audit_log is append-only", () => {
  it("rejects UPDATE", async () => {
    await audit(ACTOR, "clinic.update", "clinics", "clinic-1");
    await expect(
      db.update(schema.auditLog).set({ action: "tampered" }).where(eq(schema.auditLog.entityId, "clinic-1")),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("append-only") }) });
  });

  it("rejects DELETE", async () => {
    await audit(ACTOR, "clinic.update", "clinics", "clinic-2");
    await expect(db.delete(schema.auditLog).where(eq(schema.auditLog.entityId, "clinic-2"))).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining("append-only") }),
    });
    expect(await rowsFor("clinic-2")).toHaveLength(1);
  });

  it("keeps rows when the actor's user is deleted", async () => {
    const [user] = await db.insert(schema.users).values({ email: "gone@test", name: "Gone", role: "staff" }).returning();
    await audit(user.id, "user.update", "users", user.id);
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    const [row] = await rowsFor(user.id);
    expect(row.actorId).toBe(user.id);
  });
});

describe("redactedDiff", () => {
  it("names the changed fields without their values", () => {
    expect(redactedDiff({ name: "Jo", phone: "555-0100", dob: "1990-01-01" }, { name: "Jo", phone: "555-0199", dob: "1991-01-01" })).toEqual({
      phone: { from: "[redacted]", to: "[redacted]" },
      dob: { from: "[redacted]", to: "[redacted]" },
    });
  });

  it("is null when nothing changed", () => {
    expect(redactedDiff({ name: "Jo" }, { name: "Jo" })).toBeNull();
  });
});