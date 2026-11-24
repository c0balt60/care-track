import { timingSafeEqual } from "node:crypto";

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`, which is what
 * Vercel Cron sends. Fails closed: with no secret configured, nothing is authorized.
 */
export function isCronAuthorized(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual needs equal lengths, and comparing in constant time avoids leaking how much matched.
  return given.length === expected.length && timingSafeEqual(given, expected);
}