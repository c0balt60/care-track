Still in progress for full quickstart guide.

Primary tools you need installed:
- pnpm
- nodejs
- Docker (Docker Desktop on macOS/Windows, or Docker Engine with the Compose plugin on Linux)

follow the instructions in README.md

Quickstart:

Install dependencies
```bash
pnpm i
```

Create your local env file (gitignored). It already has working values for local dev,
including a dev-only `BETTER_AUTH_SECRET`.
```bash
cp .env.example .env
```

Start Postgres and Mailpit
```bash
docker compose up -d
```

Create the database tables (users, sessions, appointments, ...). Run this again whenever
you pull new files in `drizzle/`, or pages crash with errors like `relation "users" does not exist`.
```bash
pnpm exec drizzle-kit migrate
```

Fill the database with test data. This WIPES local data first.
```bash
pnpm db:seed
```
Seeded logins all use the password `password123`:
`patient@caretrack.test`, `practitioner@caretrack.test`, `staff@caretrack.test`, `admin@caretrack.test`.

Run dev
```bash
pnpm dev
```

## If the server crashes

| Symptom | Fix |
|---|---|
| `relation "..." does not exist` | Run `pnpm exec drizzle-kit migrate` |
| `ECONNREFUSED` on port 5432 | Postgres isn't running: `docker compose up -d` (on macOS with Colima, run `colima start` first) |
| Better Auth error about a missing secret | Your `.env` predates the dev secret: copy the `BETTER_AUTH_SECRET` line from `.env.example` and restart `pnpm dev` |
| Can't log in with the test accounts | Run `pnpm db:seed` |

## Deployed server (Vercel)

GitHub Actions secrets don't reach the deployed app; CI only lints, tests and builds.
Set these in Vercel → Settings → Environment Variables, then redeploy:

- `BETTER_AUTH_SECRET`: a fresh value from `openssl rand -base64 32`, never the dev one from `.env.example`
- `BETTER_AUTH_URL`: the deployed address, e.g. `https://<app>.vercel.app`
- `DATABASE_URL`: the production (Neon) connection string

Nothing runs migrations on deploy. After pulling new files in `drizzle/`, migrate the
production database from your machine:
```bash
DATABASE_URL="<production url>" pnpm exec drizzle-kit migrate
```
Use Neon's **unpooled** (direct) connection string here; migrations don't work well through the pooler.

## Local services

| Service  | Address                 | Used for                              |
|----------|-------------------------|---------------------------------------|
| Postgres | `localhost:5432`        | App database (`DATABASE_URL`)         |
| Mailpit  | `localhost:1025` (SMTP) | Catches outgoing email                |
| Mailpit  | http://localhost:8025   | Web inbox to read the caught emails   |

Useful commands:

```bash
docker compose ps        # are the services running and healthy?
docker compose logs -f   # follow service logs
docker compose down      # stop services (database data is kept)
docker compose down -v   # stop and DELETE the database volume
```

If port 5432 is already taken (for example by a Postgres you installed directly),
set `POSTGRES_PORT` in `.env` to another port and update the port in `DATABASE_URL` to match.
