# 10 — legwork

## Confirmed: nothing exists yet

No Dockerfile, no nginx config, no systemd unit, no CI workflow, no deploy script anywhere in the
repo. `.gitignore` already excludes `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`, and
`launch.json`. Everything below is net-new.

## The two processes

| | dev | production |
|---|---|---|
| API | `cd server && bun run dev` (`--hot`) on :3000 | `bun run start` (= `bun run src/index.ts`) as a managed service |
| Client | `ng serve` :4200, `/api` proxied by `client/proxy.conf.json` | static files served by nginx; **no ng serve** |

In production nginx does what `proxy.conf.json` does in dev: serve the built client and reverse-
proxy `/api` to `127.0.0.1:3000`. Same origin, so the session cookie keeps working unchanged.

`client/angular.json` sets no explicit `outputPath`, so `@angular/build:application` uses the
default — confirm the built directory name with one local `npm run build` before writing the
copy step.

**SPA fallback is required.** `try_files $uri $uri/ /index.html`, or every deep link 404s:
`/stats` (`06`), `/log/:videoId`, `/run/:runId`, `/pokemon/:dex`, `/admin`, and the invite URL
from `02`/`03`.

## Two things that will bite

**1. `NODE_ENV=production` is load-bearing for cookie security.**
`server/src/routes/auth.ts:22–30` sets `secure: process.env.NODE_ENV === "production"`. Miss that
env var on the VM and every session cookie ships without the Secure flag over HTTPS. Set it in
the service definition.

**2. Do NOT run `bun run db:seed` on the production box as-is.**
`server/src/db/seed/run.ts` calls `seedUsers`, which creates **admin / editor1 / editor2 /
member with username == password** (`server/src/db/seed/users.ts` — its own header says "don't
ship these to production"). That's an admin account with the password `admin`. The reference seed
(PokéAPI cache → pokemon/moves/learnsets/gyms) and the YouTube seed *are* needed on a fresh box;
the user seed is not. Split it, guard it, or seed and then immediately change the passwords —
but decide before the first prod seed, not after.

## Database

- `DATABASE_URL` defaults to `./data/app.db`, **relative to CWD**
  (`server/src/db/client.ts`). The service needs a fixed `WorkingDirectory` or an absolute
  `DATABASE_URL`.
- WAL mode is on, so the DB is three files (`app.db`, `-wal`, `-shm`). A plain `cp` is not a safe
  snapshot — use `sqlite3 app.db ".backup"`. (Relevant to the declined-but-flagged backup plan in
  `../../out-of-scope.md`.)
- Migrations: `bun run db:migrate` → `server/src/db/migrate.ts`, idempotent (drizzle tracks
  applied hashes). This satisfies AC 4 as its own step.
- `bun run db:generate` is a **developer** step — migrations are generated locally and committed
  to `server/migrations/`. Never run generate on the VM.
- Env vars to carry over (see `server/.env.example`): `DATABASE_URL`, `PORT` (default 3000),
  `NODE_ENV`, and `YOUTUBE_API_KEY` + `YOUTUBE_PLAYLIST_ID` if the video seed runs there.

## Smoke check

`GET /health` → `{ ok: true }` is mounted outside `/api` (`server/src/index.ts:21`) with no
session middleware. Use it for the service readiness check and the post-deploy smoke test.

## Also needed on the VM

Bun (the API runs on it; `bun.lock` is committed). Node is **not** needed if the client is built
locally per the decided shape. The reference seed reads a committed gzipped PokéAPI cache, so it
works offline on the box.

## Blocker

The domain isn't bought (`../../state.md` › Open decisions). Everything above can be written and
rehearsed against an IP first; only TLS and AC 1 actually wait on the name.
