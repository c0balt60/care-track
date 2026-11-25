// Resets the database and fills it with the fake data in ./seed-data.ts,
// plus one signed-in user per role. Run with `pnpm db:seed`.
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as seed from "./seed-data";
import { PATIENT_SLUG, PRACTITIONER_SLUG, STAFF_CLINIC_SLUG } from "./seed-data";
import * as schema from "./schema";
 
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: fall back to whatever is already in the environment.
}
 
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed: this wipes every table and must never run against production.");
  process.exit(1);
}
// The check above can't see a laptop whose .env points at a shared database. Wiping
// anything but a local one needs its host typed back, so it's never an accident (CMP-3 #41).
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.SEED_CONFIRM_HOST !== host) {
  console.error(
    `Refusing to seed ${host}: this wipes every table there.\n` +
      `If it really is a throwaway database (like the Neon preview branch), run again with SEED_CONFIRM_HOST=${host}`,
  );
  process.exit(1);
}
 
const DAY = 24 * 60 * 60 * 1000;
 
/** "YYYY-MM-DD" for `days` from today in the given time zone. */
function dateFromToday(days: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * DAY),
  );
}
 
/** Seed history labels → appointment_events.type */
function eventType(label: string): (typeof schema.APPOINTMENT_EVENT_TYPES)[number] {
  if (label.startsWith("Booked")) return "booked";
  const type = label.toLowerCase();
  if ((schema.APPOINTMENT_EVENT_TYPES as readonly string[]).includes(type)) return type as never;
  throw new Error(`Unknown history label in seed data: "${label}"`);
}

/**
 * Who did each seeded event, by role. The history page reads a "confirmed" event
 * with no role as instant mode confirming on its own, and seed history only has
 * "Confirmed" for approval-mode practitioners, so those must carry a role.
 */
function seedActorRole(
  type: (typeof schema.APPOINTMENT_EVENT_TYPES)[number],
  a: seed.SeedAppointment,
): (typeof schema.ROLES)[number] | null {
  switch (type) {
    case "booked": return a.bookedBy === "staff" ? "staff" : "patient";
    case "confirmed":
    case "declined": return "practitioner";
    case "cancelled": return a.cancelledBy ?? null;
    default: return null;
  }
}
 
/** One login per role. Who each one is in the seed data: PATIENT_SLUG etc. in ./seed-data.ts. */
const seedUsers = [
  { key: "patient", email: "patient@caretrack.test", name: "Jordan Lee", role: "patient" },
  { key: "practitioner", email: "practitioner@caretrack.test", name: "Dr. Sam Rivera", role: "practitioner" },
  { key: "staff", email: "staff@caretrack.test", name: "Morgan Ellis", role: "staff" },
  { key: "admin", email: "admin@caretrack.test", name: "Admin", role: "admin" },
] as const;
/** Every seed user's password. Dev only: this script refuses to run in production. */
const SEED_PASSWORD = "password123";

async function main() {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
 
  await db.transaction(async (tx) => {
    // Start clean so the seed can be re-run any time.
    await tx.execute(sql`
      TRUNCATE payments, appointment_events, appointments, availability_exceptions,
        availability_rules, clinic_staff, practitioners, patients, clinics,
        sessions, accounts, verifications, users
      RESTART IDENTITY CASCADE
    `);

    // ---- Users and their logins ----
    const users = await tx
      .insert(schema.users)
      .values(seedUsers.map(({ email, name, role }) => ({ email, name, role })))
      .returning({ id: schema.users.id, role: schema.users.role });
    const userId = Object.fromEntries(users.map((u) => [u.role, u.id])) as Record<string, string>;
    // Same shape Better Auth writes at sign-up: a "credential" account whose accountId is the user id.
    const passwordHash = await hashPassword(SEED_PASSWORD);
    await tx
      .insert(schema.accounts)
      .values(users.map((u) => ({ userId: u.id, accountId: u.id, providerId: "credential", password: passwordHash })));
 
    // ---- Clinics ----
    const clinicId = new Map<string, string>();
    for (const c of seed.clinics) {
      const [row] = await tx
        .insert(schema.clinics)
        .values({ name: c.name, address: c.address, city: c.city, phone: c.phone, services: c.services, timeZone: c.timeZone })
        .returning({ id: schema.clinics.id });
      clinicId.set(c.slug, row.id);
    }
    await tx.insert(schema.clinicStaff).values({ clinicId: clinicId.get(STAFF_CLINIC_SLUG)!, userId: userId.staff });
 
    // ---- Practitioners and their hours ----
    const practitionerId = new Map<string, string>();
    for (const p of seed.practitioners) {
      const [row] = await tx
        .insert(schema.practitioners)
        .values({
          userId: p.slug === PRACTITIONER_SLUG ? userId.practitioner : null,
          clinicId: p.clinic ? clinicId.get(p.clinic)! : null,
          name: p.name,
          credentials: p.credentials,
          specialty: p.specialty,
          services: p.services,
          bio: p.bio,
          city: p.city,
          bookingMode: p.bookingMode,
          timeZone: p.timeZone,
          slotMinutes: p.slotMinutes,
          verifiedAt: new Date(), // unverified practitioners are hidden from search (ADM-2)
        })
        .returning({ id: schema.practitioners.id });
      practitionerId.set(p.slug, row.id);
 
      const rules = Object.entries(p.hours).flatMap(([weekday, ranges]) =>
        (ranges ?? []).map(([startTime, endTime]) => ({ practitionerId: row.id, weekday: Number(weekday), startTime, endTime })),
      );
      if (rules.length) await tx.insert(schema.availabilityRules).values(rules);
 
      const exceptions = p.exceptions.flatMap((e): (typeof schema.availabilityExceptions.$inferInsert)[] => {
        const base = { practitionerId: row.id, date: dateFromToday(e.day, p.timeZone), note: e.note };
        // No hours = closed all day, stored as one row with no times.
        return e.hours.length
          ? e.hours.map(([startTime, endTime]) => ({ ...base, startTime, endTime }))
          : [{ ...base, startTime: null, endTime: null }];
      });
      if (exceptions.length) await tx.insert(schema.availabilityExceptions).values(exceptions);
    }
 
    // ---- Patients ----
    const patientId = new Map<string, string>();
    for (const p of seed.patients) {
      const [row] = await tx
        .insert(schema.patients)
        .values({
          userId: p.slug === PATIENT_SLUG ? userId.patient : null,
          name: p.name,
          dob: p.dob || null,
          phone: p.phone || null,
        })
        .returning({ id: schema.patients.id });
      patientId.set(p.slug, row.id);
    }

    // ---- Appointments and their history ----
    const appts = seed.appointments();
    for (const a of appts) {
      const [row] = await tx
        .insert(schema.appointments)
        .values({
          practitionerId: practitionerId.get(a.practitioner)!,
          patientId: patientId.get(a.patient)!,
          startsAt: a.start,
          endsAt: a.end,
          status: a.status,
          reason: a.reason,
          bookedBy: a.bookedBy,
          cancelledBy: a.cancelledBy ?? null,
          cancelReason: a.cancelReason ?? null,
          declineNote: a.declineNote ?? null,
        })
        .returning({ id: schema.appointments.id });
 
      if (a.history.length) {
        await tx.insert(schema.appointmentEvents).values(
          a.history.map((h) => {
            const type = eventType(h.label);
            return { appointmentId: row.id, type, actorRole: seedActorRole(type, a), at: h.at };
          }),
        );
      }
    }
 
    console.log(
      `Seeded ${users.length} users, ${seed.clinics.length} clinic, ${seed.practitioners.length} practitioners, ` +
        `${seed.patients.length} patients, ${appts.length} appointments.`,
    );
    console.log("Log in as:", seedUsers.map((u) => `${u.key} → ${u.email}`).join(", "), `(password: ${SEED_PASSWORD})`);
  });
 
  await pool.end();
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
 