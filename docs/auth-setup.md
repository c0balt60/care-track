# Better Auth setup

How sign-in works in Care Track, and how to get it running locally and in production.

## How the pieces fit

| File | Job |
|------|-----|
| `lib/better-auth.ts` | Better Auth config: email + password, 7-day sessions, `role` field on users, Drizzle adapter. |
| `lib/db/schema.ts` | Drizzle tables. `users`, `sessions`, `accounts`, `verifications` are the ones Better Auth reads and writes. |
| `drizzle/0002_better_auth.sql` | The migration that creates those auth tables. |
| `app/api/auth/[...all]/route.ts` | Better Auth's HTTP endpoints (`/api/auth/*`). |
| `app/(auth)/actions.ts` | Sign-up, log-in and log-out server actions that the forms call. Sign-up and log-in are rate-limited here. |
| `lib/rate-limit.ts` | Postgres-backed attempt counters (`rate_limits` table) for log-in, sign-up and booking. Limits are in `LIMITS`. |
| `lib/auth.ts` | `getViewer` / `requireRole`, which every page uses to check who is signed in. |
| `proxy.ts` | Sends signed-out visitors to `/login` (it only checks that the cookie exists). |

`/api/auth/sign-up/email` and `/api/auth/sign-in/email` are switched off over HTTP
(`disabledPaths`), so every sign-up and log-in goes through the actions and their rate
limits. The actions call `auth.api.*` directly, which still works.

Better Auth does not create tables. It expects them to exist already, with the names
and columns in `lib/db/schema.ts`. Drizzle migrations create them.

## Local setup

```bash
pnpm i
cp .env.example .env
```

Fill in the secret in `.env` (any random 32+ byte string works):

```bash
openssl rand -base64 32      # paste the output into BETTER_AUTH_SECRET=
```

Then start Postgres, create the tables, and run the app:

```bash
docker compose up -d
pnpm db:migrate              # applies every file in drizzle/ that hasn't run yet
pnpm db:seed                 # optional: WIPES the DB, then loads demo data + one login per role
pnpm dev
```

Run `pnpm db:migrate` again whenever a pull adds a file to `drizzle/`.

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `DrizzleQueryError: Failed query: select ... from "sessions"` with `relation "sessions" does not exist` (also `accounts`, `verifications`) | The migrations were never applied to this database. | `pnpm db:migrate` |
| `column "email_verified" does not exist` | The DB was created before `0002_better_auth.sql` and never migrated. | `pnpm db:migrate` |
| `extension "btree_gist" is not available` | Your Postgres doesn't ship the `btree_gist` extension (migration 0003 needs it). | Use the docker-compose Postgres or Neon, which both include it. |
| `ECONNREFUSED 127.0.0.1:5432` | Postgres isn't running, or `DATABASE_URL` has the wrong port. | `docker compose up -d`; make sure `POSTGRES_PORT` and the port in `DATABASE_URL` match. |
| `[Better Auth] ... default secret` / `BETTER_AUTH_SECRET` missing | Secret not set in `.env` or on the host. | Set `BETTER_AUTH_SECRET`. |
| `Invalid origin` on log-in | `BETTER_AUTH_URL` doesn't match the URL in the browser. Vercel previews handle this themselves (see [Preview deploys](#preview-deploys)). | Set `BETTER_AUTH_URL` to the URL the site is served from. |

Avoid `npx @better-auth/cli generate` and `migrate`. The schema here is written by hand
(plural table names, uuid ids, a `role` field), and the CLI would generate a different
one. Change auth tables in `lib/db/schema.ts`, then run `pnpm db:generate` to write a new migration.

## Changing the schema

1. Edit `lib/db/schema.ts`.
2. `pnpm db:generate` writes a new SQL file in `drizzle/`. Read it before committing.
3. `pnpm db:migrate` applies it to your local DB.
4. Commit the schema change, the SQL file, and the `drizzle/meta` changes together.

## Production (Vercel + Neon)

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string. Migrations use it (`drizzle.config.ts`). |
| `BETTER_AUTH_SECRET` | A fresh `openssl rand -base64 32`, different from your local one |
| `BETTER_AUTH_URL` | The production URL, e.g. `https://care-track.vercel.app` |
| `LOG_LEVEL` | `info` |

Vercel doesn't run migrations. Before you deploy a change that adds a file to `drizzle/`,
apply it to Neon from your machine:

```bash
DATABASE_URL_UNPOOLED="<neon direct url>" pnpm db:migrate
```

### Preview deploys

The Vercel GitHub app builds every PR and comments its preview URL. Previews sit behind
Vercel Authentication, so only team members can open them.

Previews must never use the production database. Create a Neon branch named `preview`
(Neon → Branches → New branch, from `main`) and, in Vercel, add `DATABASE_URL` and
`DATABASE_URL_UNPOOLED` for it scoped to the **Preview** environment only. Give Preview its
own `BETTER_AUTH_SECRET` too. All previews share that one branch.

`BETTER_AUTH_URL` isn't needed for Preview: `lib/better-auth.ts` uses the
`VERCEL_BRANCH_URL` and `VERCEL_URL` that Vercel sets on each preview, and trusts only
those two hosts.

Migrate the preview branch like production, with its own direct URL. To get test
accounts there, seed it (only the preview branch, never production):

```bash
DATABASE_URL_UNPOOLED="<preview direct url>" pnpm db:migrate
DATABASE_URL_UNPOOLED="<preview direct url>" pnpm db:seed
```

Never run `pnpm db:seed` against production. It wipes the database, and it refuses to
run when `NODE_ENV` or `VERCEL_ENV` is `production`.

## GitHub secrets

The CI workflow (`.github/workflows/ci.yml`) needs **no secrets**. Its tests use an
in-memory Postgres (PGlite), and `next build` doesn't connect to the database.

You only need GitHub secrets if a workflow starts using them, for example:

| Secret | Needed when |
|--------|-------------|
| `DATABASE_URL_UNPOOLED` | A workflow runs `pnpm db:migrate` against Neon on merge to `main`. |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | You deploy from GitHub Actions instead of Vercel's Git integration. |

The app's runtime secrets (`BETTER_AUTH_SECRET`, and later `RESEND_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`) belong in Vercel, not GitHub.
