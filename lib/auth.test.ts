// @vitest-environment node
// getViewer reads the Better Auth session (mocked here) and then queries the real
// schema. The DB is an in-memory Postgres (PGlite) with the real migrations, like
// lib/db/no-overlap.test.ts, so the profile lookups run as real SQL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

// `server-only` throws on import outside a React Server environment, and tests aren't one.
vi.mock("server-only", () => ({}));

// Swap the app's node-postgres client for PGlite. vi.mock is hoisted above imports,
// so the factory builds the client itself.
vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/lib/db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

// Stand-in for Better Auth: each test sets which user (if any) the cookie belongs to.
type SessionUser = { id: string; name: string; email: string; role: string };
let sessionUser: SessionUser | null = null;
vi.mock("@/lib/better-auth", () => ({
  auth: { api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

// In Next, redirect() and notFound() stop rendering by throwing. Throwing a readable
// error here lets each test check which one was called.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("notFound"); },
}));

const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/pglite/migrator");
const { getViewer, getViewerAs, requireRole } = await import("@/lib/auth");

const ids = { patient: "", practitioner: "", clinic: "" };
const users: Record<string, SessionUser> = {};

async function addUser(key: string, role: (typeof schema.USER_ROLES)[number]) {
  const [u] = await db
    .insert(schema.users)
    .values({ email: `${key}@test.dev`, name: key, role })
    .returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role });
  users[key] = u;
  return u.id;
}

beforeAll(async () => {
  // drizzle's PGlite migrator wants its own db type; the mock returns exactly that.
  await migrate(db as never, { migrationsFolder: "./drizzle" });

  const patientUser = await addUser("patient", "patient");
  const practitionerUser = await addUser("practitioner", "practitioner");
  const staffUser = await addUser("staff", "staff");
  await addUser("admin", "admin");
  // Signed up as practitioner/staff but no profile row: must get no access.
  await addUser("lonePractitioner", "practitioner");
  await addUser("loneStaff", "staff");

  const [clinic] = await db
    .insert(schema.clinics)
    .values({ name: "Clinic", address: "1 St", city: "Troy, NY", phone: "555", timeZone: "America/New_York" })
    .returning();
  const [patient] = await db.insert(schema.patients).values({ userId: patientUser, name: "Pat" }).returning();
  const [practitioner] = await db
    .insert(schema.practitioners)
    .values({
      userId: practitionerUser,
      name: "Dr. P",
      credentials: "MD",
      specialty: "Family medicine",
      city: "Troy, NY",
      timeZone: "America/New_York",
      slotMinutes: 30,
    })
    .returning();
  await db.insert(schema.clinicStaff).values({ clinicId: clinic.id, userId: staffUser });

  Object.assign(ids, { patient: patient.id, practitioner: practitioner.id, clinic: clinic.id });
});

afterAll(async () => {
  // Same cleanup as lib/db/no-overlap.test.ts. $client is the PGlite instance behind drizzle.
  await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();
});

beforeEach(() => {
  sessionUser = null;
});

describe("getViewer", () => {
  it("returns null when signed out", async () => {
    expect(await getViewer()).toBeNull();
  });

  it("finds each role's profile row", async () => {
    sessionUser = users.patient;
    expect(await getViewer()).toEqual({
      userId: users.patient.id, name: "patient", email: "patient@test.dev", role: "patient", patientId: ids.patient,
    });
    sessionUser = users.practitioner;
    expect(await getViewer()).toMatchObject({ role: "practitioner", practitionerId: ids.practitioner });
    sessionUser = users.staff;
    expect(await getViewer()).toMatchObject({ role: "staff", clinicId: ids.clinic });
  });

  it("returns a null profile id when the row doesn't exist", async () => {
    sessionUser = users.lonePractitioner;
    expect(await getViewer()).toMatchObject({ role: "practitioner", practitionerId: null });
    sessionUser = users.loneStaff;
    expect(await getViewer()).toMatchObject({ role: "staff", clinicId: null });
  });

  it("returns admins without a profile id", async () => {
    sessionUser = users.admin;
    expect(await getViewer()).toEqual({ userId: users.admin.id, name: "admin", email: "admin@test.dev", role: "admin" });
  });

  it("treats an unknown role as signed out", async () => {
    sessionUser = { ...users.patient, role: "superuser" };
    expect(await getViewer()).toBeNull();
  });
});

describe("getViewerAs", () => {
  it("returns the viewer for a matching role with a profile", async () => {
    sessionUser = users.staff;
    expect((await getViewerAs("staff"))?.clinicId).toBe(ids.clinic);
  });

  it("returns null for the wrong role, a missing profile, or signed out", async () => {
    expect(await getViewerAs("patient")).toBeNull();
    sessionUser = users.patient;
    expect(await getViewerAs("staff")).toBeNull();
    sessionUser = users.loneStaff;
    expect(await getViewerAs("staff")).toBeNull();
  });
});

describe("requireRole", () => {
  it("sends signed-out visitors to /login", async () => {
    await expect(requireRole("patient")).rejects.toThrow("redirect:/login");
  });

  it("hides the page from the wrong role", async () => {
    sessionUser = users.patient;
    await expect(requireRole("staff")).rejects.toThrow("notFound");
    sessionUser = users.admin;
    await expect(requireRole("patient", "practitioner", "staff")).rejects.toThrow("notFound");
  });

  it("hides the page when the role has no profile row", async () => {
    sessionUser = users.loneStaff;
    await expect(requireRole("staff")).rejects.toThrow("notFound");
    sessionUser = users.lonePractitioner;
    await expect(requireRole("practitioner")).rejects.toThrow("notFound");
  });

  it("returns the viewer when the role is allowed", async () => {
    sessionUser = users.practitioner;
    const viewer = await requireRole("practitioner");
    // Type-checks only if requireRole narrows to a practitioner with a non-null id.
    const id: string = viewer.practitionerId;
    expect(id).toBe(ids.practitioner);
  });

  it("accepts any of several roles", async () => {
    sessionUser = users.admin;
    expect(await requireRole("staff", "admin")).toMatchObject({ role: "admin" });
  });
});
