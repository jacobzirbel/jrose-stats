# jrose-stats

Community-built, queryable database of Jrose's all-151 Pokémon solo-run series.

**Stack:** Bun · Hono · Drizzle ORM · `bun:sqlite` (WAL). Angular island for the
workbench lands in Phase 1E. Design lives in the gobrain `jrose-stats` namespace
(`schema.md` = data-model truth, `roadmap.md` = plan).

## Layout

```
src/
  index.ts            Hono entry (Phase 1A: /health only)
  db/
    client.ts         bun:sqlite connection — WAL + foreign_keys=ON
    migrate.ts        applies ./migrations
    schema/
      core.ts         generic video-logging engine (no Pokémon knowledge)
      domain.ts       Pokémon layer (imports core; FKs point domain -> core)
      index.ts        barrel
migrations/           drizzle-kit output (generated)
tests/
  schema.test.ts      constraint drift-gate (replaces schema_test.py)
```

The **core / domain split** is load-bearing: `src/db/schema/core.ts` must never
import from `domain.ts`. Core has to compile and migrate with the domain layer
deleted.

## Setup

```bash
bun install
cp .env.example .env
bun run db:generate   # drizzle-kit: TS schema -> ./migrations
bun run db:migrate    # apply migrations to DATABASE_URL
bun test              # constraint drift-gate must be green
bun run dev           # http://localhost:3000/health
```

## Schema changes

1. Edit `src/db/schema/*.ts` (the source of truth, translated from `schema.md`).
2. `bun run db:generate` — drizzle-kit emits a migration. For incompatible
   ALTERs (CHECK / FK / UNIQUE) it emits SQLite's full table rebuild-and-copy.
3. `bun run db:migrate`.
4. `bun test` — the drift-gate re-validates the generated schema.
