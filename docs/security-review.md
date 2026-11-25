# Security review and OWASP Top 10 pass (CMP-3, #41)

This review covers the `fix/backend-security` branch:
- security headers (HRD-1)
- rate limiting (HRD-2)
- Zod validation (HRD-3)
- the access-control pass (CMP-1)
- the compliance checklist (CMP-2)
- mock-data removal (CMP-4)

It has two parts: the automated `/security-review`, and a manual pass through the [OWASP Top 10 (2021)](https://owasp.org/Top10/) for the whole app.

**Statuses:**
- **Fixed:** changed in this branch, with a test.
- **Filed:** tracked as an issue.
- **Accepted:** a known trade-off, with the reason.
- **Pass:** nothing to do.

## 1. `/security-review` on the branch

We ran Claude Code's `/security-review` against `origin/main...fix/backend-security`. It reports only issues it rates at least 8 out of 10 for confidence of real exploitability, after a separate false-positive check.

**Result: no vulnerabilities at that bar.** It checked these areas and found them sound:
- **Sign-up role:** Zod's `z.enum` allows only patient, practitioner or staff, and `role` is `input: false` in Better Auth.
- **Disabled auth paths:** Better Auth strips trailing slashes before matching, so path variants don't get around them.
- **Session-scoped writes:** the clinic, settings and booking actions take ids from the session.
- **Validation:** Zod's `z.object` drops unknown keys, so form data can't pollute prototypes.
- **SQL:** every query is parameterized.
- **XSS:** there's no `dangerouslySetInnerHTML` or `eval`.
- **Secrets:** the guards fail closed on deployments.
- **Logging:** the new error serializer only removes data from logs.

It deliberately leaves out denial-of-service, rate-limiting and data-at-rest issues. It named three of those, and they're handled in A04, A07 and A02 below.

## 2. OWASP Top 10

| # | Category | Status | What we found |
|---|---|---|---|
| A01 | Broken access control | Fixed | See the [access-control review](access-control-review.md). No attack reached another user's data. Three changes weren't audited and three unused Better Auth endpoints were open; all fixed and tested. |
| A02 | Cryptographic failures | Pass, plus 1 fix | Passwords use scrypt (Better Auth). Sessions are an httpOnly cookie checked against the database. HTTPS + HSTS. Neon encrypts at rest; see the [compliance checklist](compliance-checklist.md). **Fixed:** the rate limiter stored emails and IP addresses in plain text; keys are now SHA-256 hashes. |
| A03 | Injection | Pass | Every query goes through Drizzle with bound parameters, and the few `sql` templates interpolate only columns and parameters. `sql.raw` appears once, building check constraints from constants in `schema.ts`. LIKE searches escape `%` and `_`. React escapes all output, and email HTML escapes names (tested). |
| A04 | Insecure design | Pass, plus 1 fix | Booking races are settled by database constraints, not by checks in code. Status changes use `UPDATE ... WHERE status = <expected>`. Rate limits on log-in, sign-up and booking. **Fixed:** `pnpm db:seed` wipes every table and only refused when `NODE_ENV` was production, so a laptop whose `.env` pointed at a shared Neon database could wipe it. It now refuses any non-local host unless you type the host back (`SEED_CONFIRM_HOST`). |
| A05 | Security misconfiguration | Pass, plus 1 fix, 1 filed | Security headers on every response (HRD-1, tested). Better Auth's HTTP sign-up, sign-in and the unused account endpoints are disabled. **Fixed:** the public dev secret in `.env.example` is now refused on Vercel deployments. **Filed:** the CSP allows `'unsafe-inline'` scripts because nonces "force dynamic rendering", but every route already renders dynamically, so a nonce-based CSP is now cheap. |
| A06 | Vulnerable components | Fixed | `pnpm audit --prod` flagged Zod < 4.6.6 (memory exhaustion while validating oversized collections, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). Zod validates every server action, so it's bumped to 4.6.7, and the audit is now clean. Ongoing dependency checks are HRD-4 (#38). |
| A07 | Identification and authentication failures | Pass, 1 filed, 1 accepted | 8-character minimum password; 7-day sessions; log-out deletes the session; disabled accounts can't sign in (ADM-1). **Filed:** email verification is still off (the `TODO(EML-1 #26)` in `lib/better-auth.ts` outlived EML-1). Anyone can register an address they don't own, and appointment emails then go to it. **Accepted:** the per-email log-in limit lets someone lock a user out for 15 minutes. That's the usual price of stopping password guessing from many IPs, and it's documented in `LIMITS`. |
| A08 | Software and data integrity failures | Pass | CI installs with `--frozen-lockfile` and runs lint, tests, type checks and the build. Migrations are reviewed SQL files in `drizzle/` that run on deploy. The rate-limit migration renumbering for this merge uses `IF NOT EXISTS` so it's safe on any database. |
| A09 | Security logging and monitoring failures | Fixed | An append-only audit log covers every change and every view of patient details; three gaps were fixed in CMP-1. Structured logs with request ids. **Fixed:** logged errors could carry the patient data a failed query held (CMP-2). |
| A10 | Server-side request forgery | Pass | The server makes one outbound request, to Resend's fixed URL. Nothing fetches a URL a user supplied. |

**Accepted, from the `/security-review` exclusions:** `clientIp()` trusts `x-forwarded-for`. On Vercel the edge sets that header and a client can't spoof it. This needs revisiting only if the app is hosted elsewhere.

## Issues filed

| Issue | From |
|---|---|
| Email verification at sign-up | A07 |
| Account deletion (anonymize) and a written retention policy | CMP-2 checklist, section 5 |
| Nonce-based CSP, dropping `'unsafe-inline'` scripts | A05 |
| Practitioner invites for clinics | CMP-4 (fake invite UI removed) |
| Change email and password in settings, as a rate-limited server action | CMP-4 (fake fields removed), CMP-1 |
| Profile photo upload | CMP-4 (fake field removed) |
