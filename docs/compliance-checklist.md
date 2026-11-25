# Privacy and security checklist (CMP-2, #40)

CareTrack holds only fake data (see the [README](../README.md#fake-data-only)). We still check it the way a HIPAA-style review would, because that's the practice this project is for.

**PHI** (protected health information) here means anything about a patient: their name together with the fact that they're a patient here, date of birth, phone, appointments, and especially the reason for a visit or any note about it.

Each item says how it's checked and where the evidence is.

**Statuses:**
- **Pass:** true today, and backed by a test or a config file.
- **Fixed:** was failing; fixed in CMP-2.
- **Accepted:** a known limit, with the reason we accept it.
- **Gap:** not met yet; tracked as an issue.

Re-run the automated parts with `pnpm exec vitest run`. The manual checks are at the end.

## 1. No PHI in logs

| Check | Status | Evidence |
|---|---|---|
| Passwords, tokens, emails, cookies and auth headers are redacted from every log line | Pass | `REDACT_PATHS` in [`lib/logger.ts`](../lib/logger.ts); test "hides passwords, tokens, emails and auth headers" in [`lib/logger.test.ts`](../lib/logger.test.ts) |
| A logged error never carries the data it failed on | **Fixed** | See below. `safeError` in [`lib/logger.ts`](../lib/logger.ts); tests under "logged errors" in `lib/logger.test.ts` |
| Email and reminder modules log ids and counts only, and mask addresses in error text | Pass | `log.*` calls in [`lib/email.ts`](../lib/email.ts), [`lib/appointment-emails.ts`](../lib/appointment-emails.ts) and [`lib/appointment-reminders.ts`](../lib/appointment-reminders.ts), which use `scrub()` |
| The cron route returns and logs counts only | Pass | [`app/api/cron/reminders/route.ts`](../app/api/cron/reminders/route.ts) |
| The audit log records *that* patient details changed, not the values; free-text notes are logged as `[redacted]` | Pass | `redactedDiff` in [`lib/audit.ts`](../lib/audit.ts); `noteDiff` in [`lib/appointments.ts`](../lib/appointments.ts); tests in [`lib/audit.test.ts`](../lib/audit.test.ts) |

**What was fixed.** Sign-up and log-in log failures with `logger.error({ err })`. Errors carry row values in two places a redact path can't reach:
- Drizzle puts a failed query's **parameters in the message**: `Failed query: insert into "patients" ... params: Jordan Lee,1990-04-12,(518) 555-0110`.
- Postgres puts them in `detail`: `Key (phone)=(...) already exists`.

So a failed sign-up would have logged the new patient's name, date of birth and phone. Errors are now written by `safeError`. It keeps the error type, the first line of the message (with email addresses masked), the Postgres code and constraint, and the stack frames, and drops everything else. The test feeds it exactly that sign-up failure.

## 2. No PHI in emails

| Check | Status | Evidence |
|---|---|---|
| Emails say that something happened and when, never why: no reason, cancel reason, decline note, service, specialty or clinic name | Pass | The privacy rule at the top of [`lib/email-templates.ts`](../lib/email-templates.ts). The test "never includes health-related details, even if they're passed in" runs for every email kind in [`lib/email-templates.test.ts`](../lib/email-templates.test.ts) |
| Names are HTML-escaped | Pass | Test "escapes names in the HTML version" |
| The link goes to a page behind the login | Pass | `/appointments/[id]` uses `requireRole` and `loadAppointmentFor` (see [access-control review](access-control-review.md)) |

## 3. No PHI in URLs

| Check | Status | Evidence |
|---|---|---|
| Errors and notices travel as short codes (`?error=reason`), never as text the user typed | Pass | Every `redirect()` in `app/` interpolates a code, a status or an id; the pages show only known keys (`noticeText()` in [`components/ui.tsx`](../components/ui.tsx)) |
| Visit reasons, cancel reasons and decline notes are sent in POST bodies | Pass | The booking, cancel and decline forms are server actions |
| Record ids in URLs are random UUIDs, so they reveal nothing | Pass | `id()` columns in [`lib/db/schema.ts`](../lib/db/schema.ts) |
| Admin searches put a user's name or email in the URL (`/admin?q=`, `/admin/audit?actor=`), and URLs appear in Vercel's request logs | Accepted | Admin-only pages; the app holds fake data only. If it ever held real data, these two forms should POST. |

## 4. Encryption in transit and at rest

| Check | Status | Evidence |
|---|---|---|
| Browser to app: HTTPS only, with HSTS for two years | Pass | Vercel serves HTTPS on every deployment; the `Strict-Transport-Security` header is in [`next.config.ts`](../next.config.ts), tested by [`next.config.test.ts`](../next.config.test.ts) |
| App to database: TLS | Pass (platform default) | Neon only accepts TLS connections, and its connection strings carry `sslmode=require`. Manual check 1. |
| App to email: TLS | Pass | Production sends through Resend's HTTPS API (`fetch("https://api.resend.com/...")` in [`lib/email.ts`](../lib/email.ts)); SMTP is only for Mailpit on localhost |
| Database at rest | Pass (platform default) | Neon encrypts stored data by default. Manual check 2. |
| No other place stores PHI | Pass | No file uploads (the unused photo field was removed in CMP-4); no client-side storage of patient data |

## 5. Data retention and account deletion

| Check | Status | Evidence |
|---|---|---|
| An admin can shut an account off at once: signed out everywhere, can't sign in | Pass | `disableUser` in [`lib/admin-users.ts`](../lib/admin-users.ts), with tests |
| The audit trail survives: append-only, and keeps the actor's id after their account is gone | Pass | Trigger in [`drizzle/0004_audit_log.sql`](../drizzle/0004_audit_log.sql); tests "audit_log is append-only" in `lib/audit.test.ts` |
| Appointment history can't be lost by deleting a patient or practitioner by accident | Pass | `onDelete: "restrict"` on `appointments.patient_id` and `practitioner_id` |
| Temporary data is cleaned up | Pass | `rate_limits` is pruned by the daily cron; sessions expire after 7 days |
| **A user can ask for their account to be deleted, and it is** | **Gap** | Not built. Real erasure has to keep appointment history and the audit trail (which law requires a clinic to keep), so it means anonymizing the patient row rather than deleting it. Issue to be filed. |
| **A written retention period for each kind of data** | **Gap** | Same issue. Proposed: appointments and audit log 6 years (the HIPAA documentation rule); sessions 7 days; rate-limit rows 1 day. |

## 6. Secrets only in env

| Check | Status | Evidence |
|---|---|---|
| No real secret in the repo or its history | Pass | Searched every commit for API-key, private-key and database-URL patterns: none. `.env*` is gitignored except `.env.example`, which is the only env file ever committed. |
| The secret that *is* committed (`.env.example`'s dev-only `BETTER_AUTH_SECRET` / `CRON_SECRET`) can't be used on a deployment | **Fixed** | It's public on purpose so local setup just works. A Vercel deployment that copied it now refuses to start (Better Auth) or authorizes nothing (cron). [`lib/public-secret.ts`](../lib/public-secret.ts) and tests in [`lib/public-secret.test.ts`](../lib/public-secret.test.ts) and [`lib/cron-auth.test.ts`](../lib/cron-auth.test.ts) |
| Runtime secrets are read from the environment only | Pass | `BETTER_AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `RESEND_API_KEY` are read via `process.env`; where to set each is in [`docs/auth-setup.md`](auth-setup.md) |

## Manual checks (Vercel and Neon dashboards)

These can't be checked from the code. Whoever has access ticks them off:

1. In Vercel, the **`DATABASE_URL`** for Production and Preview ends with `sslmode=require`.
2. In the Neon project, encryption at rest is on (it's the default).
3. In Vercel, **`BETTER_AUTH_SECRET` and `CRON_SECRET`** are set, and differ from `.env.example`. If either ever used the example value, rotate it: changing `BETTER_AUTH_SECRET` signs everyone out, which is the point. The new startup check refuses the example value from now on.
4. Production has `RESEND_API_KEY` and `EMAIL_FROM`, and no `SMTP_*` pointing anywhere but localhost.
