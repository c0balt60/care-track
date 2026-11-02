/**
 * Where to send someone after they log in or sign up.
 *
 * `next` comes from the URL (/login?next=...), so anyone can write it. Only
 * same-site paths are allowed: they must start with a single "/". Anything else
 * (https://evil.com, //evil.com, /\evil.com) would make this an open redirect,
 * which phishing links use to bounce people off a trusted domain.
 */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  // "//host" and "/\host" are both read by browsers as another site.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control characters (tabs, newlines) can be stripped by browsers to form "//".
  if (/[\x00-\x1f\x7f]/.test(next)) return fallback;
  return next;
}
