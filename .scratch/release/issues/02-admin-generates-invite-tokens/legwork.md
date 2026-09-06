# 02 — legwork

## Schema

New table. It belongs in **`server/src/db/schema/core.ts`** — invites are platform/auth, the same
layer as `users` and `sessions`, and nothing about them is Pokémon. Core must not import
`domain.ts`; putting it there keeps that clean.

Shape the ticket implies: `token` (PK), `note`, `createdBy` → `users.id`, `createdAt`,
`redeemedBy` → `users.id` (nullable), `redeemedAt` (nullable). Copy the timestamp idiom already
in core: `text("created_at").notNull().default(sql\`(datetime('now'))\`)`.

Token generation: reuse the idiom in `server/src/auth/session.ts` — 32 random bytes as hex (64
chars). Same secrecy requirement, no reason to invent a second one.

## Migration workflow (from README › Schema changes)

```bash
cd server && bun run db:generate && bun run db:migrate && bun test
```

`server/reference/schema.test.ts` is a drift gate: it migrates a fresh in-memory DB from
drizzle-kit's **actual** output and asserts the CHECKs/FKs still fire. A new table with
constraints wants a case added there.

## Server

New `server/src/routes/invites.ts`, mounted in `server/src/index.ts` next to `adminRoutes`.
Guard with `requireAdmin` from `server/src/auth/middleware.ts` — that's a 401 for anonymous and
403 for under-ranked, which is AC 4 for free.

Read queries for the admin surface live in `server/src/db/queries/admin.ts`; the listing query
fits there alongside `getUsers` / `getAdminQueue`.

## Client

`client/src/app/pages/admin/admin.html` + `admin.ts` + `admin.service.ts` — add a section next to
the queue and user table. `AdminService` (`admin.service.ts`) is where the HTTP calls go; its
interfaces mirror the server shapes.

`CODING_STANDARDS.md`: template and styles stay in separate files. The admin page already
complies; keep it that way.

## Coordinate with 03

The invite **URL shape** is shared with `03` and can't be decided independently. Suggest
`/invite/:token` (an Angular route in `client/src/app/app.routes.ts`, before the `**` catch-all).
Whatever's picked, the generated URLs displayed here must be the ones `03` can redeem.
