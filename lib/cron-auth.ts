import { timingSafeEqual } from "node:crypto";
import { isPublicSecretOnDeployment } from "./public-secret";

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`, which is what
 * Vercel Cron sends. Fails closed: with no secret configured, nothing is authorized, and
 * on a deployment the public example secret from .env.example doesn't count as one.
 */
export function isCronAuthorized(request: Request, secret = process.env.CRON_SECRET, vercelEnv = process.env.VERCEL_ENV): boolean {
  if (!secret || isPublicSecretOnDeployment(secret, vercelEnv)) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual needs equal lengths, and comparing in constant time avoids leaking how much matched.
  return given.length === expected.length && timingSafeEqual(given, expected);
}
