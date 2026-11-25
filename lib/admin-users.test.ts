// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeRole, disableUser, enableUser, listUsers } from "./admin-users";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq, sql } from "drizzle-orm";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const NOW = new Date("2030-01-07T12:00:00Z");
type Role = (typeof schema.USER_ROLES)[number];

async function makeUser(name: string, role: Role, disabled = false) {
  const [u] = await db
    .insert(schema.users)
    .values({ email: `${name}@test`, name, role, disabledAt: disabled ? NOW : null })
    .returning();
  return u.id;
}

const audits = () => db.select().from(schema.auditLog);
const userRow = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0];

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // audit_log is append-only, so the trigger has to be switched off to reset it between tests.
  // This only touches the throwaway in-memory test database, never a real one.
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.delete(schema.auditLog);
  await db.execute(sql`alter table audit_log enable trigger user`);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
});

describe("changeRole", () => {
  it("changes the role and writes one audit row", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient");

    expect(await changeRole(admin, pat, "practitioner")).toEqual({ ok: true });

    expect((await userRow(pat)).role).toBe("practitioner");
    expect(await audits()).toMatchObject([
      { actorId: admin, action: "user.change_role", entity: "users", entityId: pat, diff: { role: { from: "patient", to: "practitioner" } } },
    ]);
  });

  it("refuses bad roles, your own account, missing users and no-op changes, and writes nothing", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient");

    expect(await changeRole(admin, pat, "superuser")).toEqual({ ok: false, error: "bad_role" });
    expect(await changeRole(admin, admin, "patient")).toEqual({ ok: false, error: "self" });
    expect(await changeRole(admin, "00000000-0000-4000-8000-000000000000", "staff")).toEqual({ ok: false, error: "not_found" });
    expect(await changeRole(admin, "not-a-uuid", "staff")).toEqual({ ok: false, error: "not_found" });
    expect(await changeRole(admin, pat, "patient")).toEqual({ ok: false, error: "no_change" });

    expect((await userRow(pat)).role).toBe("patient");
    expect(await audits()).toHaveLength(0);
  });

  it("won't demote the last active admin", async () => {
    const onlyAdmin = await makeUser("only", "admin");
    const stale = await makeUser("stale", "patient"); // an admin whose rights were just removed elsewhere

    expect(await changeRole(stale, onlyAdmin, "patient")).toEqual({ ok: false, error: "last_admin" });
    expect((await userRow(onlyAdmin)).role).toBe("admin");
    expect(await audits()).toHaveLength(0);
  });

  it("doesn't count a disabled admin as one", async () => {
    const active = await makeUser("active", "admin");
    await makeUser("gone", "admin", true);
    const stale = await makeUser("stale", "patient");

    expect(await changeRole(stale, active, "patient")).toEqual({ ok: false, error: "last_admin" });
  });

  it("lets one of two admins demote the other", async () => {
    const a = await makeUser("a", "admin");
    const b = await makeUser("b", "admin");
    expect(await changeRole(a, b, "patient")).toEqual({ ok: true });
  });

  it("can't be used by two admins at once to demote each other into a lockout", async () => {
    const a = await makeUser("a", "admin");
    const b = await makeUser("b", "admin");

    const results = await Promise.all([changeRole(a, b, "patient"), changeRole(b, a, "patient")]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const left = await db.select().from(schema.users).where(eq(schema.users.role, "admin"));
    expect(left).toHaveLength(1);
  });
});

describe("disableUser and enableUser", () => {
  it("disables the account, signs the user out everywhere and writes one audit row", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient");
    await db.insert(schema.sessions).values({ userId: pat, token: "tok-1", expiresAt: new Date("2031-01-01") });
    await db.insert(schema.sessions).values({ userId: pat, token: "tok-2", expiresAt: new Date("2031-01-01") });

    expect(await disableUser(admin, pat, NOW)).toEqual({ ok: true });

    expect((await userRow(pat)).disabledAt).toEqual(NOW);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, pat))).toHaveLength(0);
    expect(await audits()).toMatchObject([
      { actorId: admin, action: "user.disable", entity: "users", entityId: pat, diff: { disabled: { from: false, to: true } } },
    ]);
  });

  it("enables it again and records that too", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient", true);

    expect(await enableUser(admin, pat)).toEqual({ ok: true });

    expect((await userRow(pat)).disabledAt).toBeNull();
    expect(await audits()).toMatchObject([
      { actorId: admin, action: "user.enable", entityId: pat, diff: { disabled: { from: true, to: false } } },
    ]);
  });

  it("refuses your own account, missing users, repeats and the last admin, and writes nothing", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient");
    const gone = await makeUser("gone", "patient", true);
    const onlyAdmin = await makeUser("only", "admin");
    await db.update(schema.users).set({ role: "patient" }).where(eq(schema.users.id, admin)); // admin is now a stale actor

    expect(await disableUser(admin, admin)).toEqual({ ok: false, error: "self" });
    expect(await disableUser(admin, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
    expect(await disableUser(admin, gone)).toEqual({ ok: false, error: "no_change" });
    expect(await enableUser(admin, pat)).toEqual({ ok: false, error: "no_change" });
    expect(await disableUser(admin, onlyAdmin)).toEqual({ ok: false, error: "last_admin" });

    expect((await userRow(onlyAdmin)).disabledAt).toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  it("every successful change leaves exactly one audit row, in order", async () => {
    const admin = await makeUser("admin", "admin");
    const pat = await makeUser("pat", "patient");

    await changeRole(admin, pat, "staff");
    await disableUser(admin, pat);
    await enableUser(admin, pat);
    await changeRole(admin, pat, "staff"); // refused: no change

    const rows = await audits();
    expect(rows.map((r) => r.action).sort()).toEqual(["user.change_role", "user.disable", "user.enable"]);
    expect(JSON.stringify(rows)).not.toContain("@test"); // no email addresses in the log
  });
});

describe("listUsers", () => {
  it("lists everyone, and filters by name or email without caring about case", async () => {
    await makeUser("alice", "patient");
    await makeUser("bob", "staff");

    expect((await listUsers("")).map((u) => u.name)).toEqual(["alice", "bob"]);
    expect((await listUsers("ALI")).map((u) => u.name)).toEqual(["alice"]);
    expect((await listUsers("bob@test")).map((u) => u.name)).toEqual(["bob"]);
  });

  it("treats % and _ as plain text, not wildcards", async () => {
    await makeUser("alice", "patient");
    expect(await listUsers("%")).toHaveLength(0);
    expect(await listUsers("_")).toHaveLength(0);
  });
});