import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db } from "./db";
import { auditLog } from "./db/schema";

/** `db` or a transaction. Pass the transaction so the audit row commits or rolls back with the change. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = PgDatabase<PgQueryResultHKT, any>;

/** What changed, as `{ field: { from, to } }`. Must be JSON-serializable. */
export type AuditDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * Records who did what to which record in the append-only audit_log table.
 *
 * @param actorId  The user who acted, or null for system actions.
 * @param action   "entity.verb", e.g. "appointment.cancel".
 * @param entity   Table name of the record, e.g. "appointments".
 * @param entityId The record's id.
 * @param diff     What changed, or null when nothing meaningful did (e.g. "user.sign_in").
 * @param tx       Run inside this transaction instead of on `db` directly.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await tx.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, id));
 *   await audit(viewer.userId, "appointment.cancel", "appointments", id, { status: { from: "confirmed", to: "cancelled" } }, tx);
 * });
 */
export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  diff: AuditDiff | null = null,
  tx: Executor = db,
) {
  const [row] = await tx.insert(auditLog).values({ actorId, action, entity, entityId, diff }).returning();
  return row;
}