// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import * as schema from "./db/schema";
import { clientIp, pruneRateLimits, rateLimit, tooManyAttempts } from "./rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

const NOW = new Date("2030-01-07T12:00:00Z");
const later = (s: number) => new Date(NOW.getTime() + s * 1000);
const rule = { max: 3, windowSeconds: 60 };

describe("rateLimit()", () => {
  it("allows up to max, then refuses until the window ends", async () => {
    expect(await rateLimit("t1", rule, NOW)).toBe(0);
    expect(await rateLimit("t1", rule, later(10))).toBe(0);
    expect(await rateLimit("t1", rule, later(20))).toBe(0);
    expect(await rateLimit("t1", rule, later(30))).toBe(30); // 4th: refused, 30s left
    expect(await rateLimit("t1", rule, later(59))).toBe(1);
    expect(await rateLimit("t1", rule, later(60))).toBe(0); // new window
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("t2a", rule, NOW);
    expect(await rateLimit("t2a", rule, NOW)).toBeGreaterThan(0);
    expect(await rateLimit("t2b", rule, NOW)).toBe(0);
  });

  it("counts concurrent attempts exactly", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit("t3", rule, NOW)));
    expect(results.filter((r) => r === 0)).toHaveLength(3);
  });
});

it("pruneRateLimits() deletes only day-old counters", async () => {
  await rateLimit("old", rule, new Date(NOW.getTime() - 2 * 86_400_000));
  await rateLimit("fresh", rule, NOW);
  await pruneRateLimits(NOW);
  const keys = (await db.select().from(schema.rateLimits)).map((r) => r.key);
  expect(keys).not.toContain("old");
  expect(keys).toContain("fresh");
});

it("clientIp() takes the first forwarded address", () => {
  expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  expect(clientIp(new Headers())).toBe("unknown");
});

it("tooManyAttempts() rounds up to whole minutes", () => {
  expect(tooManyAttempts(30)).toBe("Too many attempts. Try again in 1 minute.");
  expect(tooManyAttempts(14 * 60 + 1)).toBe("Too many attempts. Try again in 15 minutes.");
});
