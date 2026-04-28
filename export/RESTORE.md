# Restoring Service Hub on a new machine

The codebase exports cleanly via git/zip, but two things live outside it and
need to be moved separately:

1. **The Postgres database** — its schema *is* in code (Drizzle, `lib/db/src/schema/`),
   but the actual rows (users, departments, tickets, projects, etc.) are not.
   They live in this folder as `database.sql`.
2. **Environment variables / secrets** — the source code references them by
   name; the values are stored in the platform, not in git. The full list is
   in `.env.example` next to this file.

---

## Step 1 — Bring up an empty Postgres

Anything Postgres 13 or newer will do. Local example:

```bash
createdb servicehub
```

Then put its connection string in `DATABASE_URL` (see `.env.example`).

## Step 2 — Restore the data

```bash
psql "$DATABASE_URL" --file=export/database.sql
```

The dump uses `DROP ... IF EXISTS` before recreating, so it is safe to
re-run; it will wipe and reload all 15 tables every time.

(If you would rather start with an empty schema and let the app build it,
skip this step and run `pnpm --filter @workspace/db run push` instead — but
then you will have no users, departments, or sample data.)

## Step 3 — Set the environment variables

Copy `.env.example` to `.env` at the repo root, fill in `DATABASE_URL` and
`SESSION_SECRET`, and however your host injects env vars (dotenv, systemd,
docker, the platform's secrets UI), make those two available to every
process.

`SESSION_SECRET` is a random string used to sign session cookies; you can
generate one with `openssl rand -hex 32`. Changing it later invalidates all
existing logins.

## Step 4 — Install and run

```bash
pnpm install
pnpm --filter @workspace/api-server run dev    # API on $PORT
pnpm --filter @workspace/itsm run dev          # Harmony ITSM
pnpm --filter @workspace/support run dev       # Harmony Support
```

(Or your host's equivalent of `pnpm run start` for production.)

## Login after restore

The dump preserves the original users and roles. Sign in as any of the seed
users; the admin account is **Lena Park** (`lena.park@ewhowell.com`,
`userId=33`, role `admin`, IT Support Ops).

---

## Re-exporting later

To refresh `database.sql` after more activity in the app, just re-run:

```bash
pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges --no-comments \
  --clean --if-exists --format=plain \
  --file=export/database.sql
```

Then strip Postgres-16-only directives so it stays portable to older Postgres:

```bash
sed -i '/^\\restrict /d; /^\\\unrestrict /d' export/database.sql
```
