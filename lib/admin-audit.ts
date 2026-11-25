// Admin audit log viewer (ADM-3 #34): find any action in audit_log by actor, entity and date.
//
// Read-only. Rows are written by audit() in ./audit.ts, from every place that changes data
// or shows patient details. This file only filters and pages through them for /admin/audit.
//
// Every filter comes from the URL, so each one is checked here before it reaches SQL:
// lengths are capped, dates must be real days, LIKE wildcards are escaped, and only a
// well-formed uuid is compared with the uuid column (anything else would be a Postgres error).
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import { addDays, type DayKey, zoned } from "./dates";
import { db } from "./db";
import { auditLog, users } from "./db/schema";

/**
 * The zone that the From/To days mean and that times are shown in. An admin has no time zone
 * of their own, and the filter and the display must agree, so the page uses one and says so.
 */
export const AUDIT_TIME_ZONE = "UTC";
export const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;
/** Typed into the Actor box to find rows with no actor (jobs, the seed script). */
const SYSTEM = "system";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditFilters = {
  /** A name or email (substring), a user id (exact), or "system". "" means anyone. */
  actor: string;
  /** A table name from audit_log.entity, e.g. "appointments". "" means any. */
  entity: string;
  /** One record's id, exact. "" means any. */
  entityId: string;
  /** First day to include, in AUDIT_TIME_ZONE. */
  from: DayKey | null;
  /** Last day to include, in AUDIT_TIME_ZONE. */
  to: DayKey | null;
  /** 1-based. */
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

/** A single trimmed string param, capped. Repeated params (?a=1&a=2) count as missing. */
const text = (v: string | string[] | undefined, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "YYYY-MM-DD" if it's a real calendar day, else null. 2026-02-30 is not. */
function day(v: string | string[] | undefined): DayKey | null {
  const s = text(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? s : null;
}

/** Turns the page's search params into filters. Anything invalid is dropped, never an error. */
export function parseAuditFilters(sp: SearchParams): AuditFilters {
  const n = Number(text(sp.page));
  return {
    actor: text(sp.actor),
    entity: text(sp.entity),
    entityId: text(sp.entityId),
    from: day(sp.from),
    to: day(sp.to),
    page: Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1,
  };
}

function actorMatch(actor: string): SQL {
  if (actor.toLowerCase() === SYSTEM) return isNull(auditLog.actorId);
  // An id finds the actor even after their user row is deleted (actor_id has no FK).
  if (UUID.test(actor)) return eq(auditLog.actorId, actor);
  const pattern = `%${actor.replace(/[\\%_]/g, "\\$&")}%`; // search text, not a pattern
  return inArray(
    auditLog.actorId,
    db.select({ id: users.id }).from(users).where(or(ilike(users.name, pattern), ilike(users.email, pattern))),
  );
}

function where(f: AuditFilters) {
  return and(
    f.actor ? actorMatch(f.actor) : undefined,
    f.entity ? eq(auditLog.entity, f.entity) : undefined,
    f.entityId ? eq(auditLog.entityId, f.entityId) : undefined,
    // [start of From, start of the day after To): both days are included in full.
    f.from ? gte(auditLog.at, zoned(f.from, 0, AUDIT_TIME_ZONE)) : undefined,
    f.to ? lt(auditLog.at, zoned(addDays(f.to, 1), 0, AUDIT_TIME_ZONE)) : undefined,
  );
}

/**
 * One page of matching rows, newest first, with the actor's name and email.
 * `actor` is null for system rows and for actors whose user row was deleted.
 *
 * Offset paging, not a cursor: Postgres keeps microseconds but a JS Date only
 * milliseconds, so a cursor made from `at` would skip or repeat rows.
 */
export async function listAuditEntries(f: AuditFilters) {
  const rows = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      diff: auditLog.diff,
      at: auditLog.at,
      actor: { name: users.name, email: users.email },
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where(f))
    // Rows written in one transaction share `at`; id breaks the tie so pages don't shift.
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(PAGE_SIZE + 1) // one extra tells us whether there's an older page
    .offset((f.page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export type AuditEntry = Awaited<ReturnType<typeof listAuditEntries>>["rows"][number];

/** Every entity type in the log, for the filter's select. New ones show up on their own. */
export async function auditEntities() {
  const rows = await db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity));
  return rows.map((r) => r.entity);
}

/** A link to /admin/audit with these filters. Empty ones and page 1 are left out of the URL. */
export function filterHref(f: Partial<AuditFilters>) {
  const sp = new URLSearchParams();
  for (const key of ["actor", "entity", "entityId", "from", "to"] as const) {
    const v = f[key];
    if (v) sp.set(key, v);
  }
  if (f.page && f.page > 1) sp.set("page", String(f.page));
  const qs = sp.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

/** "availability_exceptions" → "Availability exceptions" */
export const entityLabel = (entity: string) => {
  const words = entity.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "Nov 25, 2026, 3:04:12 PM UTC". Seconds and year matter in an audit trail. */
export const formatStamp = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: AUDIT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);

/** One side of a diff, as text. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "none";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * The diff column as display lines. audit() writes `{ field: { from, to } }`, but the column
 * is plain jsonb, so anything else is shown as best it can be rather than crashing the page.
 */
export function diffLines(diff: unknown) {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return [];
  return Object.entries(diff).map(([field, change]) => {
    const c = (change && typeof change === "object" ? change : { to: change }) as { from?: unknown; to?: unknown };
    return { field, from: formatValue(c.from), to: formatValue(c.to) };
  });
}
