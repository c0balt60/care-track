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

Create your local env file (gitignored)
```bash
cp .env.example .env
```

Start Postgres and Mailpit
```bash
docker compose up -d
```

Run dev
```bash
pnpm dev
```

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
