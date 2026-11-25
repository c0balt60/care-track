// Practitioners plus their open slots, for /search, the home page and clinic
// pages (SCH-3 #21).
//
// The service filter runs in SQL. Slots come from openSlotsFor() in one batch,
// and sorting by soonest opening happens here, because "soonest" depends on the
// slots, which are worked out in code from the hours, not stored in a column.
//
// Everything here is public: what a practitioner offers and when they're free.
// No patient data is read.
//
// Only verified practitioners are listed (ADM-2 #33). An admin verifies them on
// /admin/practitioners. Their profile page still opens by direct link.
//
// Distance (MAP-3 #53) is straight-line km from the patient's approximate point
// to the clinic, or to a solo practitioner's own location. It's worked out here,
// in code: with a few hundred practitioners that's cheaper than PostGIS.
import { and, asc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { dayKey } from "./dates";
import type { Point } from "./geocode";
import { haversineKm } from "./geo";
import { db } from "./db";
import { clinics, practitioners } from "./db/schema";
import { openSlotsFor, soonest, type OpenSlot } from "./open-slots";

export type SearchOptions = {
  /** Text to match against specialty or any service, case-insensitive. */
  service?: string;
  /** Only practitioners at this clinic. */
  clinicId?: string;
  /** "YYYY-MM-DD": ignore slots before this day (in each practitioner's zone). */
  from?: string;
  /** Shorter window than the full booking window, e.g. 7 for the home page. */
  days?: number;
  /** Where the patient searches from (approximate). Adds `km` to each result. */
  near?: Point | null;
  /** Needs `near`. Drops practitioners further away, or with no known location. */
  maxKm?: number;
  /** Drops practitioners whose next opening is more than this many days away. */
  maxWaitDays?: number;
  /** "nearest" needs `near`; practitioners with no known location go last. */
  sort?: "soonest" | "nearest";
  now?: Date;
};

export type SearchResult = Awaited<ReturnType<typeof searchPractitioners>>[number];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Makes user text safe inside ILIKE: % and _ are wildcards there, \ escapes them. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

/** Unverified practitioners never leave the database for a listing. */
const verified = isNotNull(practitioners.verifiedAt);

/**
 * Matching practitioners, soonest opening first. Practitioners with no openings
 * are still listed, last, ordered by name.
 */
export async function searchPractitioners({
  service, clinicId, from, days, near, maxKm, maxWaitDays, sort = "soonest", now = new Date(),
}: SearchOptions = {}) {
  const where: SQL[] = [verified];
  const text = service?.trim();
  if (text) {
    const pattern = likePattern(text);
    where.push(
      or(
        ilike(practitioners.specialty, pattern),
        // services is a text[] column: match if any element matches.
        sql`exists (select 1 from unnest(${practitioners.services}) as s where s ilike ${pattern})`,
      )!,
    );
  }
  if (clinicId) where.push(eq(practitioners.clinicId, clinicId));

  const rows = await db
    .select({
      practitioner: {
        id: practitioners.id,
        name: practitioners.name,
        credentials: practitioners.credentials,
        specialty: practitioners.specialty,
        city: practitioners.city,
        timeZone: practitioners.timeZone,
        slotMinutes: practitioners.slotMinutes,
        lat: practitioners.lat,
        lng: practitioners.lng,
      },
      clinic: { name: clinics.name, city: clinics.city, lat: clinics.lat, lng: clinics.lng },
    })
    .from(practitioners)
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .where(and(...where))
    .orderBy(asc(practitioners.name));

  const slotsOf = await openSlotsFor(
    rows.map((r) => r.practitioner),
    { now, days },
  );
  // A malformed ?from= is ignored rather than filtering everything out.
  const fromDay = from && DAY.test(from) ? from : null;

  const waitLimit = maxWaitDays ? now.getTime() + maxWaitDays * 86_400_000 : Infinity;

  const results = rows
    .map(({ practitioner: { lat, lng, ...practitioner }, clinic }) => {
      let slots: OpenSlot[] = slotsOf.get(practitioner.id) ?? [];
      if (fromDay) slots = slots.filter((s) => dayKey(s.start, practitioner.timeZone) >= fromDay);
      // Practitioners at a clinic are seen at the clinic, so the clinic's point wins.
      const at = clinic ? clinic : { lat, lng };
      const km = near && at.lat != null && at.lng != null ? haversineKm(near, { lat: at.lat, lng: at.lng }) : null;
      return { practitioner, clinic: clinic && { name: clinic.name, city: clinic.city }, slots, km };
    })
    .filter((r) => (!near || !maxKm || (r.km != null && r.km <= maxKm)) && (!maxWaitDays || soonest(r.slots) <= waitLimit));

  // Array sort is stable, so ties (or no openings / no location) keep the name order from SQL.
  // Compare explicitly: Infinity - Infinity is NaN, not 0.
  const key = (r: (typeof results)[number]) => (sort === "nearest" && near ? (r.km ?? Infinity) : soonest(r.slots));
  return results.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  });
}

/** Every specialty and service on offer, for the search box suggestions. Verified practitioners only. */
export async function listServices(): Promise<string[]> {
  const rows = await db
    .select({ specialty: practitioners.specialty, services: practitioners.services })
    .from(practitioners)
    .where(verified);
  return [...new Set(rows.flatMap((r) => [r.specialty, ...r.services]))].sort();
}
