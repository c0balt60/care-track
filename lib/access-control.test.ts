// @vitest-environment node
// Access-control break-it pass (CMP-1 #39). Each test signs in as one role and calls a REAL
// server action (or loader) aimed at someone else's data: another patient, another
// practitioner, another clinic, or an admin-only action. The attack must change nothing.
//
// Two clinics (X, Y), one practitioner at each (A at X, B at Y), staff at each, two
// patients (P1 sees A, P2 sees B), and an admin. Everything runs on PGlite with the real
// migrations; only the session (lib/auth) and Next's redirect/cache helpers are faked.
// Findings and what each test covers: docs/access-control-review.md.
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Fakes: who is signed in, and Next's request-only helpers ----
const session = vi.hoisted(() => ({ viewer: null as null | ({ role: string } & Record<string, string>) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/lib/db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});
// The same contract as the real lib/auth: getViewerAs returns the viewer only for the listed roles.
vi.mock("@/lib/auth", () => ({
  getViewer: async () => session.viewer,
  getViewerAs: async (...roles: string[]) => (session.viewer && roles.includes(session.viewer.role) ? session.viewer : null),
  hasProfile: () => true,
}));
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Redirect("404");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<object>()), after: () => {} }));

const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");
const appointmentActions = await import("@/app/(app)/appointments/[id]/actions");
const { bookAppointment } = await import("@/app/(app)/book/[slotId]/actions");
const { removeException } = await import("@/app/(app)/availability/actions");
const { removePractitioner, updateClinicProfile } = await import("@/app/(app)/clinic/actions");
const { updatePatientDetails, updatePractitionerProfile } = await import("@/app/(app)/settings/actions");
const adminActions = await import("@/app/(app)/admin/actions");
const adminPractitionerActions = await import("@/app/(app)/admin/practitioners/actions");
const { loadAppointmentFor } = await import("@/lib/appointments");
const { listAppointmentsFor } = await import("@/lib/appointment-lists");
const { openSlotsFor } = await import("@/lib/open-slots");

// ---- Fixture ----
type Ids = Record<"x" | "y" | "pracA" | "pracB" | "p1" | "p2" | "pendingA" | "confirmedA" | "confirmedB", string>;
type Users = Record<"patient1" | "patient2" | "pracA" | "pracB" | "staffX" | "staffY" | "admin", string>;
let id: Ids;
let user: Users;
const EXCEPTION_DAY = "2099-03-01";

const as = {
  patient1: () => ({ role: "patient", userId: user.patient1, name: "P One", email: "p1@test", patientId: id.p1 }),
  patient2: () => ({ role: "patient", userId: user.patient2, name: "P Two", email: "p2@test", patientId: id.p2 }),
  pracA: () => ({ role: "practitioner", userId: user.pracA, name: "Dr A", email: "a@test", practitionerId: id.pracA }),
  pracB: () => ({ role: "practitioner", userId: user.pracB, name: "Dr B", email: "b@test", practitionerId: id.pracB }),
  staffX: () => ({ role: "staff", userId: user.staffX, name: "Staff X", email: "sx@test", clinicId: id.x }),
  staffY: () => ({ role: "staff", userId: user.staffY, name: "Staff Y", email: "sy@test", clinicId: id.y }),
  admin: () => ({ role: "admin", userId: user.admin, name: "Admin", email: "admin@test" }),
};
type Who = keyof typeof as;

async function build() {
  const u = await db
    .insert(schema.users)
    .values([
      { email: "p1@test", name: "P One", role: "patient" },
      { email: "p2@test", name: "P Two", role: "patient" },
      { email: "a@test", name: "Dr A", role: "practitioner" },
      { email: "b@test", name: "Dr B", role: "practitioner" },
      { email: "sx@test", name: "Staff X", role: "staff" },
      { email: "sy@test", name: "Staff Y", role: "staff" },
      { email: "admin@test", name: "Admin", role: "admin" },
    ])
    .returning({ id: schema.users.id });
  user = { patient1: u[0].id, patient2: u[1].id, pracA: u[2].id, pracB: u[3].id, staffX: u[4].id, staffY: u[5].id, admin: u[6].id };

  const clinic = (name: string) => ({ name, address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: "UTC" });
  const [x, y] = await db.insert(schema.clinics).values([clinic("Clinic X"), clinic("Clinic Y")]).returning({ id: schema.clinics.id });
  await db.insert(schema.clinicStaff).values([{ clinicId: x.id, userId: user.staffX }, { clinicId: y.id, userId: user.staffY }]);

  const prac = (name: string, userId: string, clinicId: string) => ({
    name, userId, clinicId, credentials: "MD", specialty: "Family medicine", city: "Troy, NY", timeZone: "UTC",
    slotMinutes: 30, bookingMode: "approval" as const, bio: "Original bio", verifiedAt: new Date(),
  });
  const [a, b] = await db
    .insert(schema.practitioners)
    .values([prac("Dr A", user.pracA, x.id), prac("Dr B", user.pracB, y.id)])
    .returning({ id: schema.practitioners.id });
  // A is open every day, so the booking test has a real slot to aim at.
  await db.insert(schema.availabilityRules).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ practitionerId: a.id, weekday, startTime: "09:00", endTime: "17:00" })));
  await db.insert(schema.availabilityExceptions).values({ practitionerId: a.id, date: EXCEPTION_DAY, note: "A's day off" });

  const [p1, p2] = await db
    .insert(schema.patients)
    .values([
      { userId: user.patient1, name: "P One", dob: "1990-01-01", phone: "555-0101" },
      { userId: user.patient2, name: "P Two", dob: "1991-02-02", phone: "555-0102" },
    ])
    .returning({ id: schema.patients.id });

  const appt = (practitionerId: string, patientId: string, startsAt: string, status: "pending" | "confirmed") => ({
    practitionerId, patientId, status, reason: "Checkup", bookedBy: "patient" as const,
    startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
  });
  const [pendingA, confirmedA, confirmedB] = await db
    .insert(schema.appointments)
    .values([
      appt(a.id, p1.id, "2099-01-05T10:00:00Z", "pending"),
      appt(a.id, p1.id, "2099-01-06T10:00:00Z", "confirmed"),
      appt(b.id, p2.id, "2099-01-07T10:00:00Z", "confirmed"),
    ])
    .returning({ id: schema.appointments.id });

  id = { x: x.id, y: y.id, pracA: a.id, pracB: b.id, p1: p1.id, p2: p2.id, pendingA: pendingA.id, confirmedA: confirmedA.id, confirmedB: confirmedB.id };
}

/** Everything an attack could change. rate_limits is left out: booking counts attempts on purpose. */
async function snapshot() {
  const t = schema;
  return {
    appointments: await db.select({ id: t.appointments.id, status: t.appointments.status, startsAt: t.appointments.startsAt }).from(t.appointments).orderBy(t.appointments.id),
    events: (await db.select().from(t.appointmentEvents)).length,
    audit: await db.select({ action: t.auditLog.action, entityId: t.auditLog.entityId }).from(t.auditLog),
    users: await db.select({ id: t.users.id, role: t.users.role, disabledAt: t.users.disabledAt, name: t.users.name }).from(t.users).orderBy(t.users.id),
    practitioners: await db.select({ id: t.practitioners.id, clinicId: t.practitioners.clinicId, verifiedAt: t.practitioners.verifiedAt, bio: t.practitioners.bio, credentials: t.practitioners.credentials }).from(t.practitioners).orderBy(t.practitioners.id),
    clinics: await db.select({ id: t.clinics.id, name: t.clinics.name, phone: t.clinics.phone }).from(t.clinics).orderBy(t.clinics.id),
    patients: await db.select({ id: t.patients.id, name: t.patients.name, dob: t.patients.dob, phone: t.patients.phone }).from(t.patients).orderBy(t.patients.id),
    exceptions: await db.select({ id: t.availabilityExceptions.id, date: t.availabilityExceptions.date }).from(t.availabilityExceptions),
    rules: (await db.select().from(t.availabilityRules)).length,
  };
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** Runs an action as `who` and returns where it redirected to. */
async function attempt(who: Who | null, action: () => Promise<unknown>): Promise<string> {
  session.viewer = who ? as[who]() : null;
  try {
    await action();
    return "returned without redirect";
  } catch (err) {
    if (err instanceof Redirect) return err.url;
    throw err;
  }
}

/** The attack ran, and the database is exactly as it was. */
async function expectNoChange(who: Who, action: () => Promise<unknown>) {
  const before = await snapshot();
  const where = await attempt(who, action);
  expect(await snapshot()).toEqual(before);
  return where;
}

beforeAll(async () => {
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // audit_log is append-only; the trigger is switched off only to reset this in-memory test DB.
  await db.execute(sql`alter table audit_log disable trigger user`);
  await db.execute(sql`truncate audit_log, rate_limits, appointment_events, appointments, availability_exceptions, availability_rules, clinic_staff, practitioners, patients, clinics, sessions, accounts, users cascade`);
  await db.execute(sql`alter table audit_log enable trigger user`);
  await build();
});

describe("appointments: approve, decline, cancel", () => {
  const { approveAppointment, declineAppointment, cancelAppointment } = appointmentActions;
  const note = () => form({ note: "Not today" });

  it("another patient can't cancel someone else's appointment", async () => {
    expect(await expectNoChange("patient2", () => cancelAppointment(id.confirmedA, note()))).toBe(`/appointments/${id.confirmedA}`);
  });

  it("a practitioner can't act on another practitioner's appointments", async () => {
    await expectNoChange("pracB", () => approveAppointment(id.pendingA));
    await expectNoChange("pracB", () => declineAppointment(id.pendingA, note()));
    await expectNoChange("pracB", () => cancelAppointment(id.confirmedA, note()));
  });

  it("staff can't act on another clinic's appointments", async () => {
    expect(await expectNoChange("staffY", () => approveAppointment(id.pendingA))).toBe(`/appointments/${id.pendingA}`);
    await expectNoChange("staffY", () => declineAppointment(id.pendingA, note()));
    await expectNoChange("staffY", () => cancelAppointment(id.confirmedA, note()));
  });

  it("a patient can't approve their own request", async () => {
    expect(await expectNoChange("patient1", () => approveAppointment(id.pendingA))).toBe(`/appointments/${id.pendingA}?error=forbidden`);
  });

  it("an admin can't change appointments", async () => {
    expect(await expectNoChange("admin", () => cancelAppointment(id.confirmedA, note()))).toMatch(/^\/login\?next=/);
  });

  it("a malformed id is just 'not found'", async () => {
    expect(await expectNoChange("staffX", () => approveAppointment("1 OR 1=1"))).toBe("/appointments/1 OR 1=1");
  });
});

describe("appointments: reading", () => {
  it("only the parties can load an appointment's details", async () => {
    for (const who of ["patient2", "pracB", "staffY", "admin"] as const) {
      expect(await loadAppointmentFor(as[who]() as never, id.confirmedA), who).toBeNull();
    }
    for (const who of ["patient1", "pracA", "staffX"] as const) {
      expect(await loadAppointmentFor(as[who]() as never, id.confirmedA), who).not.toBeNull();
    }
  });

  it("lists only include the viewer's own appointments, whatever filter is passed", async () => {
    // Staff at Y asking for practitioner A (at X) gets nothing, not X's schedule.
    expect(await listAppointmentsFor(as.staffY() as never, { practitionerId: id.pracA })).toEqual([]);
    const forB = await listAppointmentsFor(as.pracB() as never, { practitionerId: id.pracA });
    expect(forB.map((r) => r.appointment.id)).toEqual([id.confirmedB]);
    expect(await listAppointmentsFor(as.admin() as never)).toEqual([]);
  });
});

describe("booking", () => {
  it("a patient can't move someone else's appointment by passing its id", async () => {
    const [slot] = (await openSlotsFor([{ id: id.pracA, timeZone: "UTC", slotMinutes: 30 }])).get(id.pracA)!;
    const where = await expectNoChange("patient2", () => bookAppointment(slot.id, id.confirmedA, form({ reason: "Move it" })));
    expect(where).toContain("error=reschedule");
  });

  it("only patients can book; other roles are turned away", async () => {
    const [slot] = (await openSlotsFor([{ id: id.pracA, timeZone: "UTC", slotMinutes: 30 }])).get(id.pracA)!;
    for (const who of ["staffX", "pracA", "admin"] as const) {
      expect(await expectNoChange(who, () => bookAppointment(slot.id, null, form({ reason: "Hi" }))), who).toContain("error=staff");
    }
  });
});

describe("availability", () => {
  it("a practitioner can't remove another practitioner's exception", async () => {
    await expectNoChange("pracB", () => removeException(form({ date: EXCEPTION_DAY })));
  });
});

describe("clinic", () => {
  const profile = { name: "Hijacked", phone: "555-0199", address: "2 Side St", city: "Albany, NY", services: "" };

  it("staff can't remove a practitioner from another clinic", async () => {
    expect(await expectNoChange("staffY", () => removePractitioner(form({ practitionerId: id.pracA })))).toBe("/clinic?error=not-on-team");
  });

  it("staff can only edit their own clinic, whatever ids the form adds", async () => {
    await attempt("staffY", () => updateClinicProfile(form({ ...profile, clinicId: id.x, id: id.x })));
    const [x] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, id.x));
    expect(x.name).toBe("Clinic X");
  });

  it("non-staff can't use the clinic actions", async () => {
    for (const who of ["patient1", "pracA", "admin"] as const) {
      expect(await expectNoChange(who, () => removePractitioner(form({ practitionerId: id.pracA }))), who).toBe("/clinic?error=no-clinic");
      expect(await expectNoChange(who, () => updateClinicProfile(form(profile))), who).toBe("/clinic?error=no-clinic");
    }
  });
});

describe("settings", () => {
  it("a patient can only edit their own details, whatever ids the form adds", async () => {
    await attempt("patient2", () => updatePatientDetails(form({ name: "Changed", dob: "1980-05-05", phone: "555-0177", patientId: id.p1, id: id.p1 })));
    const [p1] = await db.select().from(schema.patients).where(eq(schema.patients.id, id.p1));
    expect(p1).toMatchObject({ name: "P One", dob: "1990-01-01", phone: "555-0101" });
  });

  it("a practitioner can only edit their own profile, whatever ids the form adds", async () => {
    await attempt("pracB", () => updatePractitionerProfile(form({ credentials: "PhD", specialty: "X", services: "", bio: "Hacked", practitionerId: id.pracA, id: id.pracA })));
    const [a] = await db.select().from(schema.practitioners).where(eq(schema.practitioners.id, id.pracA));
    expect(a).toMatchObject({ credentials: "MD", bio: "Original bio" });
  });

  it("other roles can't use the patient or practitioner forms", async () => {
    expect(await expectNoChange("staffX", () => updatePatientDetails(form({ name: "X", dob: "1980-05-05", phone: "555-0177" })))).toBe("/settings?error=no-patient");
    expect(await expectNoChange("patient1", () => updatePractitionerProfile(form({ credentials: "X", specialty: "X" })))).toBe("/settings?error=no-practitioner");
  });
});

describe("admin actions", () => {
  it("nobody but an admin can change roles, disable accounts or verify practitioners", async () => {
    for (const who of ["patient1", "pracA", "staffX"] as const) {
      const target = form({ userId: user.patient2, role: "admin", practitionerId: id.pracB });
      expect(await expectNoChange(who, () => adminActions.setRole(target)), who).toBe("/login");
      expect(await expectNoChange(who, () => adminActions.disableAccount(target)), who).toBe("/login");
      expect(await expectNoChange(who, () => adminActions.enableAccount(target)), who).toBe("/login");
      expect(await expectNoChange(who, () => adminPractitionerActions.unverifyPractitioner(target)), who).toBe("/login");
      expect(await expectNoChange(who, () => adminPractitionerActions.verifyPractitioner(target)), who).toBe("/login");
    }
  });
});

// Positive controls: the same actions DO work for the right person. Without these, a broken
// fixture could make every "nothing changed" test above pass for the wrong reason.
describe("the right person can still do it, and it's audited", () => {
  const actions = async () => (await db.select({ action: schema.auditLog.action }).from(schema.auditLog)).map((r) => r.action);

  it("staff at the practitioner's clinic can approve", async () => {
    expect(await attempt("staffX", () => appointmentActions.approveAppointment(id.pendingA))).toBe(`/appointments/${id.pendingA}?notice=confirmed`);
    expect(await actions()).toEqual(["appointment.confirm"]);
  });

  it("staff can edit their own clinic and remove their own practitioner", async () => {
    const profile = { name: "Clinic Y renamed", phone: "555-0199", address: "2 Side St", city: "Albany, NY", services: "" };
    expect(await attempt("staffY", () => updateClinicProfile(form(profile)))).toBe("/clinic?notice=saved");
    expect(await attempt("staffY", () => removePractitioner(form({ practitionerId: id.pracB })))).toBe("/clinic?notice=removed");
    expect(await actions()).toEqual(["clinic.update", "practitioner.leave_clinic"]);
  });

  it("a practitioner can edit their own profile", async () => {
    expect(await attempt("pracB", () => updatePractitionerProfile(form({ credentials: "DO", specialty: "Peds", services: "", bio: "New" })))).toBe("/settings?notice=saved");
    expect(await actions()).toEqual(["practitioner.update"]);
  });

  it("a patient can edit their own details", async () => {
    expect(await attempt("patient2", () => updatePatientDetails(form({ name: "P Two", dob: "1991-02-02", phone: "555-0177" })))).toBe("/settings?notice=saved");
    expect(await actions()).toEqual(["patient.update"]);
  });
});
