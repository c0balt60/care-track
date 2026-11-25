import "server-only";
// Rate limiting for login, sign-up, and booking (HRD-2 #36).
//
// Fixed-window counters in Postgres (the rate_limits table), so every server instance shares
// them; in-memory counters would reset per Vercel instance. One atomic upsert per check:
// concurrent requests can't both read a stale count.
//
// Server actions can't answer with HTTP 429 in a way the form can show, so callers turn a
// refusal into a form error. Better Auth's own limiter covers the /api/auth/* HTTP routes.
import { lt, sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimits } from "./db/schema";

/** The limits in one place, so they're easy to review and tune. */
export const LIMITS = {
  loginPerIp: { max: 20, windowSeconds: 15 * 60 },
  // Per email too, so guessing one account's password from many IPs is still capped.
  // Trade-off: someone can lock a real user out of logging in for up to 15 minutes.
  loginPerEmail: { max: 10, windowSeconds: 15 * 60 },
  signupPerIp: { max: 5, windowSeconds: 60 * 60 },
  bookingPerUser: { max: 20, windowSeconds: 60 * 60 },
} as const;

/**
 * Counts one attempt against `key`. Returns 0 when allowed, or the seconds until the
 * window resets when the attempt is over the limit. Refused attempts still count, but
 * the window doesn't move, so waiting it out always works.
 */
export async function rateLimit(
  key: string,
  { max, windowSeconds }: { max: number; windowSeconds: number },
  now = new Date(),
): Promise<number> {
  const at = sql`${now.toISOString()}::timestamptz`;
  // The window has ended when it started at or before this moment.
  const expired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - windowSeconds * 1000).toISOString()}::timestamptz`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      // Both expressions read the row as it was before this update.
      set: {
        windowStart: sql`CASE WHEN ${expired} THEN ${at} ELSE ${rateLimits.windowStart} END`,
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      },
    })
    .returning();

  if (row.count <= max) return 0;
  return Math.max(1, Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
}

/** The form message for a refused attempt. */
export const tooManyAttempts = (retryAfterSeconds: number) =>
  `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? "s" : ""}.`;

/**
 * The client's IP. On Vercel, x-forwarded-for is set by Vercel's edge and can't be spoofed
 * by the client. Behind another host it can be, so check the proxy setup before relying
 * on it there. Without the header (local dev), everyone shares the "unknown" bucket.
 */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

/** Deletes counters whose window ended over a day ago. Called by the daily cron. */
export async function pruneRateLimits(now = new Date()) {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}
