// Admin user management (ADM-1 #32): list users, change a role, disable or enable an account.
//
// Every change writes its audit row inside the same transaction, so a change and its
// record commit or roll back together. That's the "done when".
//
// Guards: an admin can't change or disable themselves, and the last active admin can't be
// demoted or disabled. To make that last check hold when two admins act at once, every
// change first locks all active admins, always in the same order. The second change then
// waits, sees the first one's result, and gets refused if it would leave nobody.
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { audit } from "./audit";
import { db } from "./db";
import { sessions, USER_ROLES, users } from "./db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Role = (typeof USER_ROLES)[number];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const isRole = (value: string): value is Role => (USER_ROLES as readonly string[]).includes(value);

export type AdminError = "not_found" | "bad_role" | "self" | "last_admin" | "no_change";
export type AdminResult = { ok: true } | { ok: false; error: AdminError };

/** Messages for /admin?error=. Only these keys are shown, so the URL can't inject text. */
export const adminErrors: Record<AdminError, string> = {
  not_found: "That user doesn't exist.",
  bad_role: "Choose a valid role.",
  self: "You can't change your own account here. Ask another admin.",
  last_admin: "That would leave no active admin. Make someone else an admin first.",
  no_change: "Nothing to change: the account is already that way.",
};

export async function listUsers(query: string) {
  const q = query.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&"); // search text, not a pattern
  const match = q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined;
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, disabledAt: users.disabledAt, createdAt: users.createdAt })
    .from(users)
    .where(match)
    .orderBy(asc(users.name), asc(users.id))
    .limit(200);
}

/** Locks the active admins (in id order), then the target user. Null when the user doesn't exist. */
async function begin(tx: Tx, userId: string) {
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.disabledAt)))
    .orderBy(asc(users.id))
    .for("update");
  if (!UUID.test(userId)) return null;

  const [user] = await tx
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  return user ? { user, activeAdmins: admins.length } : null;
}

const isLastActiveAdmin = (user: { role: string; disabledAt: Date | null }, activeAdmins: number) =>
  user.role === "admin" && !user.disabledAt && activeAdmins <= 1;

/** Changes a user's role. Only the account's role: it doesn't create a patient or practitioner profile. */
export async function changeRole(actorId: string, userId: string, roleInput: unknown): Promise<AdminResult> {
  const role = String(roleInput ?? "");
  if (!isRole(role)) return { ok: false, error: "bad_role" };
  if (actorId === userId) return { ok: false, error: "self" };

  return db.transaction(async (tx) => {
    const found = await begin(tx, userId);
    if (!found) return { ok: false, error: "not_found" } as const;
    const { user, activeAdmins } = found;

    if (user.role === role) return { ok: false, error: "no_change" } as const;
    if (role !== "admin" && isLastActiveAdmin(user, activeAdmins)) return { ok: false, error: "last_admin" } as const;

    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await audit(actorId, "user.change_role", "users", userId, { role: { from: user.role, to: role } }, tx);
    return { ok: true } as const;
  });
}

/** Disables an account and signs it out everywhere. It can't sign in again until it's enabled. */
export async function disableUser(actorId: string, userId: string, now = new Date()): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, error: "self" };

  return db.transaction(async (tx) => {
    const found = await begin(tx, userId);
    if (!found) return { ok: false, error: "not_found" } as const;
    const { user, activeAdmins } = found;

    if (user.disabledAt) return { ok: false, error: "no_change" } as const;
    if (isLastActiveAdmin(user, activeAdmins)) return { ok: false, error: "last_admin" } as const;

    await tx.update(users).set({ disabledAt: now }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(actorId, "user.disable", "users", userId, { disabled: { from: false, to: true } }, tx);
    return { ok: true } as const;
  });
}

export async function enableUser(actorId: string, userId: string): Promise<AdminResult> {
  return db.transaction(async (tx) => {
    const found = await begin(tx, userId);
    if (!found) return { ok: false, error: "not_found" } as const;
    if (!found.user.disabledAt) return { ok: false, error: "no_change" } as const;

    await tx.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
    await audit(actorId, "user.enable", "users", userId, { disabled: { from: true, to: false } }, tx);
    return { ok: true } as const;
  });
}