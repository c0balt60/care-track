// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDueReminders } from "./appointment-reminders";
import { db } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});
vi.mock("./email", () => ({ sendEmail: vi.fn() }));
vi.mock("./logger", () => ({ logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) } }));

const sendEmailMock = vi.mocked(sendEmail);

const NOW = new Date("2030-01-07T12:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

let practitionerId: string;
let patientId: string;

async function addAppointment(
  startsAt: Date,
  overrides: Partial<typeof schema.appointments.$inferInsert> = {},
) {
  const [a] = await db
    .insert(schema.appointments)
    .values({
      practitionerId,
      patientId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "confirmed",
      reason: "SECRET-REASON",
      bookedBy: "patient",
      ...overrides,
    })
    .returning();
  return a;
}

const reminderSentAt = async (id: string) =>
  (await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)))[0].reminderSentAt;

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const [p] = await db
    .insert(schema.practitioners)
    .values({ name: "Dr. Rivera", credentials: "MD", specialty: "SECRET-SPECIALTY", city: "Troy, NY", bookingMode: "instant", timeZone: "America/New_York", slotMinutes: 30 })
    .returning();
  practitionerId = p.id;
  const [user] = await db.insert(schema.users).values({ email: "jordan@test", name: "Jordan Lee", role: "patient" }).returning();
  const [patient] = await db.insert(schema.patients).values({ userId: user.id, name: "Jordan Lee" }).returning();
  patientId = patient.id;
});

beforeEach(async () => {
  await db.delete(schema.appointments);
  vi.clearAllMocks();
});

describe("sendDueReminders", () => {
  it("sends one email however many times it's called", async () => {
    const appt = await addAppointment(hoursFromNow(5));

    expect(await sendDueReminders(NOW)).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(await sendDueReminders(NOW)).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(await reminderSentAt(appt.id)).not.toBeNull();
  });

  it("sends one email when two runs overlap", async () => {
    await addAppointment(hoursFromNow(5));
    const runs = await Promise.all([sendDueReminders(NOW), sendDueReminders(NOW)]);
    expect(runs.reduce((total, r) => total + r.sent, 0)).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("emails the patient, with no private details", async () => {
    await addAppointment(hoursFromNow(5));
    await sendDueReminders(NOW);

    const message = sendEmailMock.mock.calls[0][0];
    expect(message.to).toBe("jordan@test");
    expect(message.subject).toMatch(/reminder/i);
    expect(message.text).toContain("Dr. Rivera");
    expect(JSON.stringify(message)).not.toContain("SECRET");
  });

  it("only reminds confirmed appointments that start within the next 24 hours", async () => {
    await addAppointment(hoursFromNow(5)); // due
    await addAppointment(hoursFromNow(30)); // too far away
    await addAppointment(hoursFromNow(-1)); // already started
    await addAppointment(hoursFromNow(8), { status: "pending" }); // not confirmed

    expect(await sendDueReminders(NOW)).toMatchObject({ due: 1, sent: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next run when sending fails", async () => {
    const appt = await addAppointment(hoursFromNow(5));
    sendEmailMock.mockRejectedValueOnce(new Error("mail is down"));

    expect(await sendDueReminders(NOW)).toMatchObject({ due: 1, sent: 0, failed: 1 });
    expect(await reminderSentAt(appt.id)).toBeNull();

    expect(await sendDueReminders(NOW)).toMatchObject({ sent: 1, failed: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("skips patients with no account email, and doesn't keep retrying them", async () => {
    const [walkIn] = await db.insert(schema.patients).values({ name: "Walk-in" }).returning();
    const appt = await addAppointment(hoursFromNow(5), { patientId: walkIn.id });

    expect(await sendDueReminders(NOW)).toMatchObject({ due: 1, sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await reminderSentAt(appt.id)).not.toBeNull();
    expect(await sendDueReminders(NOW)).toMatchObject({ due: 0 });
  });
});