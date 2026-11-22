// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import * as schema from "./db/schema";
import { listServices, searchPractitioners } from "./practitioner-search";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

// Monday 2030-01-07, 7:00 in New York.
const NOW = new Date("2030-01-07T12:00:00Z");
const NY = "America/New_York";
const names = (rows: { practitioner: { name: string } }[]) => rows.map((r) => r.practitioner.name);

let riverside: string;

/** Open on the given weekdays (0 = Sunday), 9:00–12:00. */
async function makePractitioner(name: string, specialty: string, services: string[], weekdays: number[], clinicId: string | null = null) {
  const [p] = await db
    .insert(schema.practitioners)
    .values({ name, credentials: "MD", specialty, services, city: "Troy, NY", timeZone: NY, slotMinutes: 30, clinicId })
    .returning();
  if (weekdays.length) {
    await db.insert(schema.availabilityRules).values(weekdays.map((weekday) => ({ practitionerId: p.id, weekday, startTime: "09:00", endTime: "12:00" })));
  }
  return p;
}

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const [c] = await db
    .insert(schema.clinics)
    .values({ name: "Riverside Clinic", address: "1 Main St", city: "Troy, NY", phone: "555-0100", timeZone: NY })
    .returning();
  riverside = c.id;
  // Soonest first would be: Adams (Mon), Baker (Wed), Carter (Fri), then Dunn (never open).
  await makePractitioner("Dr. Carter", "Dermatology", ["Acne care", "Skin check"], [5], riverside);
  await makePractitioner("Dr. Adams", "Family medicine", ["Annual physical", "Flu shot"], [1], riverside);
  await makePractitioner("Dr. Dunn", "Pediatrics", ["Well-child visit"], []);
  await makePractitioner("Dr. Baker", "Physical therapy", ["Sports injury", "100% recovery plan"], [3]);
});

describe("searchPractitioners", () => {
  it("lists everyone soonest opening first, no openings last", async () => {
    const rows = await searchPractitioners({ now: NOW });
    expect(names(rows)).toEqual(["Dr. Adams", "Dr. Baker", "Dr. Carter", "Dr. Dunn"]);
    expect(rows.at(-1)!.slots).toEqual([]);
  });

  it("matches the specialty or any service, ignoring case", async () => {
    expect(names(await searchPractitioners({ service: "derma", now: NOW }))).toEqual(["Dr. Carter"]);
    expect(names(await searchPractitioners({ service: "FLU SHOT", now: NOW }))).toEqual(["Dr. Adams"]);
    expect(names(await searchPractitioners({ service: "  check ", now: NOW }))).toEqual(["Dr. Carter"]);
    expect(await searchPractitioners({ service: "dentistry", now: NOW })).toEqual([]);
  });

  it("treats % and _ in the search text as plain characters", async () => {
    expect(names(await searchPractitioners({ service: "100%", now: NOW }))).toEqual(["Dr. Baker"]);
    expect(await searchPractitioners({ service: "%", now: NOW })).toHaveLength(1);
    expect(await searchPractitioners({ service: "_", now: NOW })).toEqual([]);
  });

  it("narrows to one clinic, with the clinic's name and city", async () => {
    const rows = await searchPractitioners({ clinicId: riverside, now: NOW });
    expect(names(rows)).toEqual(["Dr. Adams", "Dr. Carter"]);
    expect(rows[0].clinic).toEqual({ name: "Riverside Clinic", city: "Troy, NY" });
    const solo = await searchPractitioners({ service: "pediatrics", now: NOW });
    expect(solo[0].clinic).toBeNull();
  });

  it("`from` skips earlier days and re-sorts by the first opening after it", async () => {
    // From Thursday Jan 10: Carter (Fri 11th) is now sooner than Adams (Mon 14th) and Baker (Wed 16th).
    const rows = await searchPractitioners({ from: "2030-01-10", now: NOW });
    expect(names(rows)).toEqual(["Dr. Carter", "Dr. Adams", "Dr. Baker", "Dr. Dunn"]);
    expect(rows[0].slots[0].start).toEqual(new Date("2030-01-11T14:00:00Z"));
  });

  it("ignores a malformed `from`", async () => {
    const rows = await searchPractitioners({ from: "next tuesday", now: NOW });
    expect(names(rows)).toEqual(["Dr. Adams", "Dr. Baker", "Dr. Carter", "Dr. Dunn"]);
  });

  it("`days` shortens the window", async () => {
    // In the next 3 days (Mon–Wed) only Adams and Baker are open.
    const rows = await searchPractitioners({ days: 3, now: NOW });
    expect(rows.filter((r) => r.slots.length).map((r) => r.practitioner.name)).toEqual(["Dr. Adams", "Dr. Baker"]);
  });
});

describe("listServices", () => {
  it("lists every specialty and service once, sorted", async () => {
    const all = await listServices();
    expect(all).toContain("Dermatology");
    expect(all).toContain("Flu shot");
    expect(all).toEqual([...new Set(all)].sort());
  });
});
