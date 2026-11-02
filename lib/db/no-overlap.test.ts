// @vitest-environment node
// Proves the appointments_no_overlap exclusion constraint works. Runs the real
// migrations against an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
 
const client = new PGlite({ extensions: { btree_gist } });
const db = drizzle(client, { schema });
 
let practitionerId: string;
let otherPractitionerId: string;
let patientId: string;
 
const at = (hhmm: string) => new Date(`2030-01-07T${hhmm}:00Z`);
 
function book(start: string, end: string, overrides: Partial<typeof schema.appointments.$inferInsert> = {}) {
  return db.insert(schema.appointments).values({
    practitionerId,
    patientId,
    startsAt: at(start),
    endsAt: at(end),
    status: "confirmed",
    bookedBy: "patient",
    ...overrides,
  });
}
 
/** Postgres error code for an exclusion constraint violation. */
const EXCLUSION_VIOLATION = { cause: expect.objectContaining({ code: "23P01" }) };
 
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
 
  const [p1, p2] = await db
    .insert(schema.practitioners)
    .values(
      ["Dr. One", "Dr. Two"].map((name) => ({
        name,
        credentials: "MD",
        specialty: "Family medicine",
        city: "Troy, NY",
        timeZone: "America/New_York",
        slotMinutes: 30,
      })),
    )
    .returning();
  const [pt] = await db.insert(schema.patients).values({ name: "Pat" }).returning();
  practitionerId = p1.id;
  otherPractitionerId = p2.id;
  patientId = pt.id;
});
 
beforeEach(async () => {
  await db.delete(schema.appointments);
});
 
afterAll(async () => {
  await client.close();
});
 
describe("appointments_no_overlap", () => {
  it("rejects a second overlapping appointment for the same practitioner", async () => {
    await book("10:00", "10:30");
    await expect(book("10:15", "10:45")).rejects.toMatchObject(EXCLUSION_VIOLATION);
  });
 
  it("rejects an exact double booking", async () => {
    await book("10:00", "10:30");
    await expect(book("10:00", "10:30", { status: "pending" })).rejects.toMatchObject(EXCLUSION_VIOLATION);
  });
 
  it("allows back-to-back appointments", async () => {
    await book("10:00", "10:30");
    await expect(book("10:30", "11:00")).resolves.toBeDefined();
  });
 
  it("allows overlaps with a different practitioner", async () => {
    await book("10:00", "10:30");
    await expect(book("10:00", "10:30", { practitionerId: otherPractitionerId })).resolves.toBeDefined();
  });
 
  it.each(["cancelled", "declined"] as const)("ignores %s appointments", async (status) => {
    await book("10:00", "10:30", { status });
    await expect(book("10:00", "10:30")).resolves.toBeDefined();
  });
});