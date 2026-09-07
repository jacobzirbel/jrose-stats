# Release — state

**Overall:** not started, apart from `08` (three runs logged). Nothing built, nothing deployed.

**Spec:** `spec.md`. Declined items: `out-of-scope.md`. This directory is authoritative; the
gobrain namespace mirrors it for chat sessions and holds the history.

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Move picker filters to learnset | — |
| 02 | Admin generates invite tokens | — |
| 04 | Slot-2 gate switch | — |
| 05 | Release a claimed slot | — |
| 06 | `/stats` placeholder | — |
| 07 | FAQ page | — |
| 08 | Log three runs | — · **done** |
| 03 | Redeem invite, close signup | 02 |
| 09 | Prove the reconcile path | 03, 04 |
| 10 | Deploy to a public URL | 03, 04, 05, 06, 07 |
| 11 | Hand out invite tokens | 09, 10 |

Six are startable today. `01` gates nothing — quality-of-life for everyone logging from here on,
droppable if invites matter more.

## Decisions (settled 2026-09-06)

- **Site-wide config → env var, not a table.** The slot-2 gate is one boolean; an env var is
  enough and flipping it costs a redeploy, which is acceptable with one operator. The
  `site_settings` table recommended in `issues/04-slot-two-gate-switch/legwork.md` is NOT built.
  Revisit only if a second flag appears or the gate needs flipping without a deploy window — a
  cheap migration later, not a foundation being unwound.
- **Email → drop the column entirely.** JZ does not want to deal with email at all: no
  verification, no reset flow, no Auth0. Username + password only; a locked-out logger gets a
  manual reset from JZ or makes a new account, which is fine for a handful of invited people.
  Chosen over dropping just the NOT NULL (leaves a dead column) and over synthesizing
  `username@local` as the seed does (a lie in the database). Touch points to change — verified
  2026-09-06, and note the column is NOT NULL **and** UNIQUE:
  - `server/src/db/schema/core.ts` — the column, plus a migration
  - `server/src/routes/auth.ts` — signup validation and insert
  - `server/src/auth/session.ts` — `SessionUser.email` and its SELECT
  - `server/src/db/queries/admin.ts` — `AdminUser.email` and its SELECT
  - `server/src/db/seed/users.ts` — the `${username}@local` synthesis
  Belongs to `03`; JZ runs the migration.

## Open decisions

- **Domain name.** Deferred by JZ 2026-09-06 — not choosing yet, placeholders everywhere are
  fine. Shape remains settled: generic apex, this site on a `jrose.` subdomain. Blocks `10` only
  at the point of actual deploy.

## Notes

Every startable ticket has had a legwork pass against the live code. `01`–`05`, `09` and `10`
carry a `legwork.md` in their directory; `06`, `07` and `11` needed only a few lines in their own
Notes.

**Sequencing catch:** `09` (prove the reconcile path) needs `04` deployed but left **open** —
closing the slot-2 gate is `09`'s last acceptance criterion, not part of building `04`.
