// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_DELETED, DELETED_PATIENT_NAME, deleteOwnAccount } from "./account-deletion";
import { deleteUser } from "./admin-users";
import { db } from "./db";
import * as schema from "./db/schema";
import { findPatients } from "./patient-lookup";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

const NOW = new Date("2030-01-07T12:00:00Z");
const PASSWORD = "correct-horse";
let hash: string;

let jordan: { userId: string; patientId: string };
let practitionerId: string;
let appt: { upcomingConfirmed: string; upcomingPending: string; past: string; othersUpcoming: string };

const at = (iso: string) => ({ startsAt: new Date(iso), endsAt: new Date(new Date(iso).getTime() + 30 * 60_000) });

async function makeUser(email: string, role: (typeof schema.USER_ROLES)[number], name = email) {
  const [u] = await db.insert(schema.users).values({ email, name, role }).returning();
  await db.insert(schema.accounts).values({ userId: u.id, accountId: u.id, providerId: "credential", password: hash });
  return u.id;
}

const auditActions = async () => (await db.select({ action: schema.auditLog.action }).from(schema.auditLog)).map((r) => r.action).sort();
const appointment = async (id: string) => (await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)))[0];

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  hash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.execute(sql`truncate audit_log, appointment_events, appointments, clinic_staff, practitioners, patients, clinics, sessions, accounts, users cascade`);
  await db.execute(sql`alter table audit_log enable trigger user`);

  const userId = await makeUser("jordan@test", "patient", "Jordan Lee");
  await db.insert(schema.sessions).values([
    { userId, token: "phone", expiresAt: new Date("2031-01-01") },
    { userId, token: "laptop", expiresAt: new Date("2031-01-01") },
  ]);
  const [p] = await db.insert(schema.patients).values({ userId, name: "Jordan Lee", dob: "1990-04-12", phone: "(518) 555-0110" }).returning();
  jordan = { userId, patientId: p.id };

  const [bob] = await db.insert(schema.patients).values({ name: "Bob Other", dob: "1980-01-01", phone: "555-0199" }).returning();
  const [prac] = await db
    .insert(schema.practitioners)
    .values({ name: "Dr. A", credentials: "MD", specialty: "Family medicine", city: "Troy, NY", timeZone: "UTC", slotMinutes: 30 })
    .returning();
  practitionerId = prac.id;

  const rows = await db
    .insert(schema.appointments)
    .values([
      { practitionerId, patientId: p.id, status: "confirmed", bookedBy: "patient", reason: "Rash", ...at("2030-02-01T10:00:00Z") },
      { practitionerId, patientId: p.id, status: "pending", bookedBy: "patient", reason: "Check", ...at("2030-02-02T10:00:00Z") },
      { practitionerId, patientId: p.id, status: "completed", bookedBy: "patient", reason: "Flu", ...at("2029-12-01T10:00:00Z") },
      { practitionerId, patientId: bob.id, status: "confirmed", bookedBy: "patient", reason: "Other", ...at("2030-02-03T10:00:00Z") },
    ])
    .returning({ id: schema.appointments.id });
  appt = { upcomingConfirmed: rows[0].id, upcomingPending: rows[1].id, past: rows[2].id, othersUpcoming: rows[3].id };
});

describe("deleteOwnAccount", () => {
  it("deletes the login, anonymizes the patient, and cancels only their upcoming appointments", async () => {
    expect(await deleteOwnAccount(jordan.userId, PASSWORD, NOW)).toEqual({ ok: true });

    // The login is gone, and with it every session (signed out everywhere) and the password hash.
    expect(await db.select().from(schema.users).where(eq(schema.users.id, jordan.userId))).toEqual([]);
    expect(await db.select().from(schema.sessions)).toEqual([]);
    expect(await db.select().from(schema.accounts)).toEqual([]);

    // The patient row stays for the clinic's records, without anything that identifies them.
    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, jordan.patientId));
    expect(patient).toMatchObject({ name: DELETED_PATIENT_NAME, dob: null, phone: null, userId: null, deletedAt: NOW });

    for (const id of [appt.upcomingConfirmed, appt.upcomingPending]) {
      expect(await appointment(id)).toMatchObject({ status: "cancelled", cancelledBy: "patient", cancelReason: ACCOUNT_DELETED });
    }
    expect((await appointment(appt.past)).status).toBe("completed"); // history isn't touched
    expect((await appointment(appt.othersUpcoming)).status).toBe("confirmed"); // nor anyone else's

    const events = await db.select().from(schema.appointmentEvents);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "cancelled" && e.actorRole === "patient" && e.note === ACCOUNT_DELETED)).toBe(true);

    expect(await auditActions()).toEqual(["appointment.cancel", "appointment.cancel", "patient.anonymize", "user.delete"]);
    // The audit trail says what happened without keeping who they were.
    const trail = JSON.stringify(await db.select().from(schema.auditLog));
    expect(trail).not.toMatch(/Jordan|jordan@test|555-0110|1990-04-12/);
  });

  it("frees the email to sign up again, and the front desk can no longer look them up", async () => {
    await deleteOwnAccount(jordan.userId, PASSWORD, NOW);
    await expect(db.insert(schema.users).values({ email: "jordan@test", name: "Jordan Again", role: "patient" })).resolves.toBeDefined();
    expect(await findPatients("Jordan Lee", "1990-04-12")).toEqual([]);
  });

  it("refuses a wrong or missing password, and changes nothing", async () => {
    for (const password of ["wrong-horse", "", undefined, "x".repeat(500)]) {
      expect(await deleteOwnAccount(jordan.userId, password, NOW)).toEqual({ ok: false, error: "password" });
    }
    expect(await db.select().from(schema.users).where(eq(schema.users.id, jordan.userId))).toHaveLength(1);
    expect((await appointment(appt.upcomingConfirmed)).status).toBe("confirmed");
    expect(await auditActions()).toEqual([]);
  });
});

describe("deleteUser (admin)", () => {
  it("deletes a patient's account the same way, with the admin as the actor", async () => {
    const admin = await makeUser("admin@test", "admin");
    expect(await deleteUser(admin, jordan.userId, NOW)).toEqual({ ok: true });

    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, jordan.patientId));
    expect(patient.name).toBe(DELETED_PATIENT_NAME);
    const actors = await db.select({ actorId: schema.auditLog.actorId }).from(schema.auditLog);
    expect(actors.every((r) => r.actorId === admin)).toBe(true);
  });

  it("keeps a practitioner's public profile, just without a login", async () => {
    const admin = await makeUser("admin@test", "admin");
    const user = await makeUser("dr@test", "practitioner");
    await db.update(schema.practitioners).set({ userId: user }).where(eq(schema.practitioners.id, practitionerId));

    expect(await deleteUser(admin, user, NOW)).toEqual({ ok: true });
    const [p] = await db.select().from(schema.practitioners).where(eq(schema.practitioners.id, practitionerId));
    expect(p).toMatchObject({ name: "Dr. A", userId: null });
    expect((await appointment(appt.upcomingConfirmed)).status).toBe("confirmed"); // the clinic manages those
  });

  it("removes a staff member's clinic link", async () => {
    const admin = await makeUser("admin@test", "admin");
    const staff = await makeUser("desk@test", "staff");
    const [c] = await db.insert(schema.clinics).values({ name: "C", address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: "UTC" }).returning();
    await db.insert(schema.clinicStaff).values({ clinicId: c.id, userId: staff });

    expect(await deleteUser(admin, staff, NOW)).toEqual({ ok: true });
    expect(await db.select().from(schema.clinicStaff)).toEqual([]);
  });

  it("refuses your own account, the last active admin and missing users, and writes nothing", async () => {
    const admin = await makeUser("admin@test", "admin");
    const stale = await makeUser("stale@test", "patient"); // an admin whose rights were removed elsewhere

    expect(await deleteUser(admin, admin, NOW)).toEqual({ ok: false, error: "self" });
    expect(await deleteUser(stale, admin, NOW)).toEqual({ ok: false, error: "last_admin" });
    expect(await deleteUser(admin, "00000000-0000-4000-8000-000000000000", NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await deleteUser(admin, "not-a-uuid", NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await auditActions()).toEqual([]);
  });
});
