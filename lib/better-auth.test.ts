// @vitest-environment node
// Runs the real Better Auth config (lib/better-auth.ts) against an in-memory Postgres
// (PGlite) with the real migrations, like lib/auth.test.ts. Only the settings this repo
// chose are tested, not Better Auth itself.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE_URL = "http://localhost:3000";
// Better Auth reads these when lib/better-auth.ts is imported (below), so set them first.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
vi.stubEnv("BETTER_AUTH_URL", BASE_URL);

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/lib/db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

// The nextCookies plugin writes cookies through next/headers, which only exists inside a
// Next request. A no-op cookie store lets auth.api calls run here.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/pglite/migrator");
const { auth } = await import("@/lib/better-auth");

const PASSWORD = "correct-horse";

function signUp(email: string, extra: Record<string, unknown> = {}) {
  return auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Test", ...extra } as never });
}

/** Signs in the way the logIn action does, returning the response headers (with set-cookie). */
async function signIn(email: string, password = PASSWORD) {
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  return headers;
}

/** A request through the HTTP handler, the way the browser reaches /api/auth/*. */
function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // sessions and accounts cascade from users.
  await db.delete(schema.users);
});

describe("sign-up (server side, as the signUp action calls it)", () => {
  it("stores the user in the plural tables with a uuid id and the patient role", async () => {
    const { user } = await signUp("new@test.dev");

    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(user.role).toBe("patient");

    const [row] = await db.select().from(schema.users);
    expect(row).toMatchObject({ id: user.id, email: "new@test.dev", role: "patient" });

    // The password lives in accounts, hashed.
    const [account] = await db.select().from(schema.accounts);
    expect(account.userId).toBe(user.id);
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
  });

  it("does not let the request choose a role", async () => {
    // role has input: false, so Better Auth silently ignores it and the default applies.
    const { user } = await signUp("sneaky@test.dev", { role: "admin" });
    expect(user.role).toBe("patient");
    const [row] = await db.select({ role: schema.users.role }).from(schema.users);
    expect(row.role).toBe("patient");
  });

  it("rejects passwords shorter than 8 characters", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "short@test.dev", password: "1234567", name: "Test" } }),
    ).rejects.toThrow();
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });
});

describe("HTTP routes", () => {
  it("blocks sign-up over HTTP, so every account goes through the signUp action", async () => {
    const res = await post("/sign-up/email", { email: "http@test.dev", password: PASSWORD, name: "Test" });
    expect(res.status).toBe(404);
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });

  it("blocks sign-in over HTTP, so every log-in goes through the rate-limited logIn action", async () => {
    await signUp("http@test.dev");
    const res = await post("/sign-in/email", { email: "http@test.dev", password: PASSWORD });
    expect(res.status).toBe(404);
  });
});

describe("sign-in (server side, as the logIn action calls it)", () => {
  it("signs in with the right password and sets an httpOnly session cookie lasting 7 days", async () => {
    const { user } = await signUp("login@test.dev");
    await db.delete(schema.sessions); // drop the autoSignIn session so only the sign-in one is left

    expect((await signIn("login@test.dev")).get("set-cookie")).toMatch(/session_token=.*HttpOnly/i);

    const [session] = await db.select().from(schema.sessions);
    expect(session.userId).toBe(user.id);
    const days = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("refuses a wrong password", async () => {
    await signUp("login@test.dev");
    await expect(signIn("login@test.dev", "wrong-password")).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });
});

describe("getSession", () => {
  it("returns the user, with role, for the cookie sign-in gave", async () => {
    const { user } = await signUp("me@test.dev");
    const cookie = (await signIn("me@test.dev")).get("set-cookie")!.split(";")[0];

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ id: user.id, email: "me@test.dev", role: "patient" });
  });

  it("returns null without a cookie", async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});

describe("disabled accounts", () => {
  const sessionsOf = (userId: string) => db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));

  it("can't sign in, and no session is created", async () => {
    const { user } = await signUp("off@test.dev");
    await db.update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, user.id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)); // sign-up made one

    await expect(
      auth.api.signInEmail({ body: { email: "off@test.dev", password: PASSWORD } }),
    ).rejects.toMatchObject({ body: { code: "ACCOUNT_DISABLED" } });
    expect(await sessionsOf(user.id)).toHaveLength(0);
  });

  it("gives a wrong password the normal error, not the disabled one", async () => {
    const { user } = await signUp("off2@test.dev");
    await db.update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, user.id));

    await expect(
      auth.api.signInEmail({ body: { email: "off2@test.dev", password: "wrong-password" } }),
    ).rejects.not.toMatchObject({ body: { code: "ACCOUNT_DISABLED" } });
  });

  it("signs in again once the account is enabled", async () => {
    const { user } = await signUp("back@test.dev");
    await db.update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, user.id));
    await db.update(schema.users).set({ disabledAt: null }).where(eq(schema.users.id, user.id));

    const res = await auth.api.signInEmail({ body: { email: "back@test.dev", password: PASSWORD } });
    expect(res.user.id).toBe(user.id);
  });
});
