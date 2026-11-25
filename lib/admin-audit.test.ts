// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuditFilters,
  auditEntities,
  diffLines,
  entityLabel,
  filterHref,
  formatStamp,
  formatValue,
  listAuditEntries,
  PAGE_SIZE,
  parseAuditFilters,
} from "./admin-audit";
import { db } from "./db";
import * as schema from "./db/schema";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const GONE = "99999999-9999-4999-8999-999999999999"; // an actor whose user row no longer exists

async function makeUser(name: string) {
  const [u] = await db.insert(schema.users).values({ email: `${name}@test`, name, role: "admin" }).returning();
  return u.id;
}

/** Inserts an audit row with a chosen time. Inserts are allowed; only UPDATE and DELETE are blocked. */
async function log(at: string, values: Partial<typeof schema.auditLog.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.auditLog)
    .values({ actorId: null, action: "thing.do", entity: "things", entityId: "t1", at: new Date(at), ...values })
    .returning();
  return row.id;
}

const filters = (f: Partial<AuditFilters> = {}): AuditFilters => ({
  actor: "",
  entity: "",
  entityId: "",
  from: null,
  to: null,
  page: 1,
  ...f,
});
const ids = async (f: Partial<AuditFilters>) => (await listAuditEntries(filters(f))).rows.map((r) => r.id);

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // audit_log is append-only, so the trigger has to be switched off to reset it between tests.
  // This only touches the throwaway in-memory test database, never a real one.
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.delete(schema.auditLog);
  await db.execute(sql`alter table audit_log enable trigger user`);
  await db.delete(schema.users);
});

describe("listAuditEntries", () => {
  it("lists newest first, with the actor's name and email, and handles system and deleted actors", async () => {
    const alice = await makeUser("alice");
    const byAlice = await log("2030-01-07T10:00:00Z", { actorId: alice, diff: { role: { from: "patient", to: "staff" } } });
    const bySystem = await log("2030-01-07T11:00:00Z");
    const byGone = await log("2030-01-07T12:00:00Z", { actorId: GONE });

    const { rows, hasMore } = await listAuditEntries(filters());

    expect(hasMore).toBe(false);
    expect(rows.map((r) => r.id)).toEqual([byGone, bySystem, byAlice]);
    expect(rows[2]).toMatchObject({
      actorId: alice,
      actor: { name: "alice", email: "alice@test" },
      diff: { role: { from: "patient", to: "staff" } },
    });
    expect(rows[1]).toMatchObject({ actorId: null, actor: null });
    expect(rows[0]).toMatchObject({ actorId: GONE, actor: null });
  });

  it("filters by actor name or email (any case), id, or 'system'", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const a = await log("2030-01-07T10:00:00Z", { actorId: alice });
    const b = await log("2030-01-07T11:00:00Z", { actorId: bob });
    const s = await log("2030-01-07T12:00:00Z");
    const g = await log("2030-01-07T13:00:00Z", { actorId: GONE });

    expect(await ids({ actor: "ALI" })).toEqual([a]);
    expect(await ids({ actor: "bob@test" })).toEqual([b]);
    expect(await ids({ actor: "@test" })).toEqual([b, a]);
    expect(await ids({ actor: alice })).toEqual([a]);
    expect(await ids({ actor: GONE })).toEqual([g]); // still findable after the user is gone
    expect(await ids({ actor: "System" })).toEqual([s]);
    expect(await ids({ actor: "nobody" })).toEqual([]);
  });

  it("treats % and _ in the actor box as plain text, not wildcards", async () => {
    await log("2030-01-07T10:00:00Z", { actorId: await makeUser("alice") });
    expect(await ids({ actor: "%" })).toEqual([]);
    expect(await ids({ actor: "_" })).toEqual([]);
  });

  it("filters by entity, and by entity and record id for one record's history", async () => {
    const appt1 = await log("2030-01-07T10:00:00Z", { entity: "appointments", entityId: "a1" });
    const appt2 = await log("2030-01-07T11:00:00Z", { entity: "appointments", entityId: "a2" });
    const user = await log("2030-01-07T12:00:00Z", { entity: "users", entityId: "a1" });

    expect(await ids({ entity: "appointments" })).toEqual([appt2, appt1]);
    expect(await ids({ entity: "appointments", entityId: "a1" })).toEqual([appt1]);
    expect(await ids({ entityId: "a1" })).toEqual([user, appt1]);
  });

  it("includes both From and To days in full, in UTC", async () => {
    const before = await log("2030-01-06T23:59:59.999Z");
    const start = await log("2030-01-07T00:00:00.000Z");
    const end = await log("2030-01-07T23:59:59.999Z");
    const after = await log("2030-01-08T00:00:00.000Z");

    expect(await ids({ from: "2030-01-07", to: "2030-01-07" })).toEqual([end, start]);
    expect(await ids({ from: "2030-01-07" })).toEqual([after, end, start]);
    expect(await ids({ to: "2030-01-07" })).toEqual([end, start, before]);
  });

  it("pages through results without gaps or repeats", async () => {
    // Every row at the same moment, as in one transaction: the id tie-break keeps pages stable.
    const all = [];
    for (let i = 0; i <= PAGE_SIZE; i++) all.push(await log("2030-01-07T10:00:00Z", { entityId: `t${i}` }));

    const p1 = await listAuditEntries(filters({ page: 1 }));
    const p2 = await listAuditEntries(filters({ page: 2 }));

    expect(p1.rows).toHaveLength(PAGE_SIZE);
    expect(p1.hasMore).toBe(true);
    expect(p2.rows).toHaveLength(1);
    expect(p2.hasMore).toBe(false);
    expect([...p1.rows, ...p2.rows].map((r) => r.id).sort()).toEqual(all.sort());
  });
});

describe("auditEntities", () => {
  it("lists each entity type once, sorted", async () => {
    await log("2030-01-07T10:00:00Z", { entity: "users" });
    await log("2030-01-07T11:00:00Z", { entity: "appointments" });
    await log("2030-01-07T12:00:00Z", { entity: "users" });
    expect(await auditEntities()).toEqual(["appointments", "users"]);
  });
});

describe("parseAuditFilters", () => {
  it("defaults to no filters on page 1", () => {
    expect(parseAuditFilters({})).toEqual(filters());
  });

  it("keeps valid values, trimmed", () => {
    expect(
      parseAuditFilters({ actor: "  alice ", entity: "users", entityId: " u1 ", from: "2030-01-07", to: "2030-01-08", page: "3" }),
    ).toEqual({ actor: "alice", entity: "users", entityId: "u1", from: "2030-01-07", to: "2030-01-08", page: 3 });
  });

  it("drops days that aren't real, repeated params and bad pages, and caps long text", () => {
    expect(parseAuditFilters({ from: "2030-02-30", to: "junk" })).toMatchObject({ from: null, to: null });
    expect(parseAuditFilters({ from: "2030-1-7" }).from).toBeNull();
    expect(parseAuditFilters({ actor: ["a", "b"] }).actor).toBe("");
    for (const page of ["0", "-1", "1.5", "abc", ""]) expect(parseAuditFilters({ page }).page).toBe(1);
    expect(parseAuditFilters({ page: "99999999" }).page).toBe(10_000);
    expect(parseAuditFilters({ actor: "x".repeat(500) }).actor).toHaveLength(100);
  });
});

describe("filterHref", () => {
  it("leaves out empty filters and page 1", () => {
    expect(filterHref(filters())).toBe("/admin/audit");
    expect(filterHref(filters({ entity: "users", page: 1 }))).toBe("/admin/audit?entity=users");
    expect(filterHref(filters({ actor: "a&b", page: 2 }))).toBe("/admin/audit?actor=a%26b&page=2");
  });

  it("round-trips through parseAuditFilters", () => {
    const f = filters({ actor: "bob", entity: "appointments", entityId: "a1", from: "2030-01-01", to: "2030-01-31", page: 4 });
    const sp = Object.fromEntries(new URL(filterHref(f), "http://x").searchParams);
    expect(parseAuditFilters(sp)).toEqual(f);
  });
});

describe("display helpers", () => {
  it("formats diff values", () => {
    expect(formatValue(null)).toBe("none");
    expect(formatValue([])).toBe("none");
    expect(formatValue(["Mon 09:00-17:00", "Tue 09:00-12:00"])).toBe("Mon 09:00-17:00, Tue 09:00-12:00");
    expect(formatValue("confirmed")).toBe("confirmed");
    expect(formatValue(30)).toBe("30");
    expect(formatValue(false)).toBe("false");
  });

  it("turns a diff into lines, and copes with odd shapes", () => {
    expect(diffLines({ status: { from: null, to: "confirmed" }, slotMinutes: { from: 30, to: 45 } })).toEqual([
      { field: "status", from: "none", to: "confirmed" },
      { field: "slotMinutes", from: "30", to: "45" },
    ]);
    expect(diffLines(null)).toEqual([]);
    expect(diffLines(["not", "a", "diff"])).toEqual([]);
    expect(diffLines({ note: "plain" })).toEqual([{ field: "note", from: "none", to: "plain" }]);
  });

  it("labels entities and stamps times with year, seconds and zone", () => {
    expect(entityLabel("availability_exceptions")).toBe("Availability exceptions");
    const stamp = formatStamp(new Date("2030-01-07T15:04:12Z"));
    expect(stamp).toContain("2030");
    expect(stamp).toContain("3:04:12");
    expect(stamp).toContain("UTC");
  });
});
