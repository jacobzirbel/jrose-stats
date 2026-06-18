# jrose-stats

Community-built, queryable database of Jrose's all-151 Pokémon solo-run series.

**Stack:** Angular (zoneless, standalone) SPA frontend · Bun · Hono JSON API ·
Drizzle ORM · `bun:sqlite` (WAL). Design lives in the gobrain `jrose-stats`
namespace (`schema.md` = data-model truth, `roadmap.md` = plan).

## Layout

```
server/                 Bun + Hono JSON API
  src/
    index.ts            Hono entry — JSON API under /api
    routes/             auth.ts (1C), spine.ts (1D)
    auth/               password, session, middleware
    db/
      client.ts         bun:sqlite connection — WAL + foreign_keys=ON
      schema/           core.ts (generic engine) + domain.ts (Pokémon)
      queries/spine.ts  public read queries
      seed/             reference + youtube seed
  migrations/           drizzle-kit output (generated)
  reference/            bun:test drift-gate + query/auth tests
client/                 Angular SPA (npm, Node 22 — see client/.nvmrc)
  src/app/
    app.ts              shell (header + router-outlet)
    auth.service.ts     current-user signal
    spine.service.ts    spine/detail reads
    pages/              spine-grid, pokemon-detail, login, signup
  proxy.conf.json       /api -> http://localhost:3000 in dev
```

The **core / domain split** is load-bearing: `server/src/db/schema/core.ts` must
never import from `domain.ts`. Core has to compile and migrate with the domain
layer deleted. **Read is public; an account is required only to log.**

## Run (two processes)

```bash
# API — from server/
cd server
bun install
cp .env.example .env
bun run db:generate   # drizzle-kit: TS schema -> ./migrations
bun run db:migrate    # apply migrations to DATABASE_URL
bun run db:seed       # reference + (with YT keys) video/run seed
bun test              # drift-gate + query/auth tests must be green
bun run dev           # JSON API on http://localhost:3000

# Frontend — from client/ (needs Node 22; `nvm use`)
cd client
npm install
npm start             # ng serve on http://localhost:4200 (proxies /api -> 3000)
```

Open http://localhost:4200. The Angular dev server proxies `/api/*` to the Hono
API, so the session cookie is same-origin.

## Schema changes

1. Edit `server/src/db/schema/*.ts` (source of truth, translated from `schema.md`).
2. `bun run db:generate` — drizzle-kit emits a migration (full rebuild-and-copy
   for incompatible CHECK / FK / UNIQUE ALTERs).
3. `bun run db:migrate`.
4. `bun test` — the drift-gate re-validates the generated schema.
