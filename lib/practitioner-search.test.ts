// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite), so it needs no Docker or DATABASE_URL.
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
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

/** Open on the given weekdays (0 = Sunday), 9:00–12:00. Verified unless `verified` is false. */
async function makePractitioner(
  name: string,
  specialty: string,
  services: string[],
  weekdays: number[],
  clinicId: string | null = null,
  verified = true,
) {
  const [p] = await db
    .insert(schema.practitioners)
    .values({
      name, credentials: "MD", specialty, services, city: "Troy, NY", timeZone: NY, slotMinutes: 30, clinicId,
      verifiedAt: verified ? NOW : null,
    })
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
  // Unverified (ADM-2): open Monday at Riverside, so if it leaked it would top every list below.
  await makePractitioner("Dr. Early", "Allergy", ["Allergy testing"], [1], riverside, false);
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
    expect(rows[0].clinic).toMatchObject({ name: "Riverside Clinic", city: "Troy, NY" });
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

  it("leaves out unverified practitioners, even when they match", async () => {
    expect(await searchPractitioners({ service: "allergy", now: NOW })).toEqual([]);
    expect(names(await searchPractitioners({ now: NOW }))).not.toContain("Dr. Early");
    expect(names(await searchPractitioners({ clinicId: riverside, now: NOW }))).not.toContain("Dr. Early");
  });

  it("includes them for staff booking at their own clinic (includeUnverified)", async () => {
    // Early and Adams both open Monday at 9:00, so they tie and keep name order.
    expect(names(await searchPractitioners({ clinicId: riverside, includeUnverified: true, now: NOW }))).toEqual(["Dr. Adams", "Dr. Early", "Dr. Carter"]);
  });

  it("`days` shortens the window", async () => {
    // In the next 3 days (Mon–Wed) only Adams and Baker are open.
    const rows = await searchPractitioners({ days: 3, now: NOW });
    expect(rows.filter((r) => r.slots.length).map((r) => r.practitioner.name)).toEqual(["Dr. Adams", "Dr. Baker"]);
  });
});

describe("searchPractitioners near a point (MAP-3)", () => {
  const downtown = { lat: 43.65, lng: -79.38 };
  const northYork = { lat: 43.76, lng: -79.41 }; // about 12.5 km north of downtown

  beforeAll(async () => {
    await db.update(schema.clinics).set(downtown).where(eq(schema.clinics.id, riverside));
    await db.update(schema.practitioners).set(northYork).where(eq(schema.practitioners.name, "Dr. Baker"));
    // Dr. Dunn has no location at all.
  });

  it("adds the distance from the clinic, or from a solo practitioner", async () => {
    const rows = await searchPractitioners({ near: downtown, now: NOW });
    const km = Object.fromEntries(rows.map((r) => [r.practitioner.name, r.km]));
    expect(km["Dr. Adams"]).toBe(0);
    expect(km["Dr. Baker"]).toBeCloseTo(12.6, 0);
    expect(km["Dr. Dunn"]).toBeNull();
    expect((await searchPractitioners({ now: NOW }))[0].km).toBeNull(); // no point, no distance
  });

  it("`maxKm` drops anyone further away or with no location", async () => {
    expect(names(await searchPractitioners({ near: downtown, maxKm: 5, now: NOW }))).toEqual(["Dr. Adams", "Dr. Carter"]);
    expect(names(await searchPractitioners({ near: downtown, maxKm: 25, now: NOW }))).toEqual(["Dr. Adams", "Dr. Baker", "Dr. Carter"]);
    // Without a point there's nothing to measure from, so the limit is ignored.
    expect(await searchPractitioners({ maxKm: 5, now: NOW })).toHaveLength(4);
  });

  it("sorts nearest first, ties by soonest-then-name, no location last", async () => {
    const rows = await searchPractitioners({ near: northYork, sort: "nearest", now: NOW });
    expect(names(rows)).toEqual(["Dr. Baker", "Dr. Adams", "Dr. Carter", "Dr. Dunn"]);
  });

  it("`maxWaitDays` keeps only practitioners with an opening that soon", async () => {
    // Now is Monday 7:00. Adams opens today, Baker Wednesday, Carter Friday, Dunn never.
    expect(names(await searchPractitioners({ maxWaitDays: 1, now: NOW }))).toEqual(["Dr. Adams"]);
    expect(names(await searchPractitioners({ maxWaitDays: 3, now: NOW }))).toEqual(["Dr. Adams", "Dr. Baker"]);
  });
});

describe("listServices", () => {
  it("lists every specialty and service once, sorted", async () => {
    const all = await listServices();
    expect(all).toContain("Dermatology");
    expect(all).toContain("Flu shot");
    expect(all).toEqual([...new Set(all)].sort());
  });

  it("doesn't suggest what only unverified practitioners offer", async () => {
    const all = await listServices();
    expect(all).not.toContain("Allergy");
    expect(all).not.toContain("Allergy testing");
  });
});
