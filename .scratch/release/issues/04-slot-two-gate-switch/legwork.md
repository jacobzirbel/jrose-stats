# 04 — legwork

## The one enforcement point

`server/src/routes/workbench.ts:131–144`, inside `POST /api/logs/:videoId/open`:

```ts
if (!log) {                                   // ← the caller holds no live log yet
  const taken = ...;                          // slots already held on this video
  const slot = [1, 2].find((s) => !taken.includes(s));
  if (slot == null) return c.json({ error: "Both logger slots for this video are taken." }, 409);
```

Gate closed ⇒ consider only slot `1`. That's the whole behaviour change. AC 2 wants a distinct
message — today's 409 text ("Both logger slots... are taken") is wrong when slot 2 is merely
gated shut, not held.

**AC 4 comes free.** The existing-log lookup at `:124–130` runs *before* this branch and returns
the caller's log untouched, so a slot-2 log already in progress keeps working when the switch
flips. Put the check inside the `if (!log)` block and don't touch anything else.

**AC 5 comes free too** as long as the switch is read per-request rather than cached at boot.

## Where the switch lives (the open decision in `../../state.md`)

There is no site-settings mechanism today. Two candidates:

- **A `site_settings` core table.** Mirror the shape of `user_settings`
  (`server/src/db/schema/core.ts:48`): `key` PK, `value` as JSON-encoded text. Same idiom the
  codebase already uses, three columns, no new concepts. **Recommended.**
- An env var. Rejected: AC 1 says an admin can *see and change* it, and an env var means a
  redeploy for every flip.

Resist a general feature-flag system — the ticket says so, and one key is enough.

Serving it: a sibling of `server/src/routes/settings.ts` (which is per-*user*, not site-wide —
don't overload it). Write behind `requireAdmin`; read can be open, since "second slots are
closed" isn't a secret and the client needs it to explain itself. Mount in `server/src/index.ts`.

Migration + drift gate: same loop as `02` — `bun run db:generate` → `db:migrate` → `bun test`
against `server/reference/schema.test.ts`.

## Client

- Admin control: `client/src/app/pages/admin/admin.html` / `admin.ts` / `admin.service.ts`.
- The refusal message surfaces where `open()` is called —
  `client/src/app/pages/workbench.ts` constructor, which today maps any non-401 error to
  `notFound.set(true)`. A gated 409 rendered as "not found" would be the bad-error-message
  failure AC 2 exists to prevent.

## Copy that goes stale when the gate closes

`client/src/app/pages/spine-grid.html:18–20` tells every visitor: *find a video with an open slot
(fewer than 👤 2/2 loggers), and log it — a second logger is all a run needs to get verified.*
With slot 2 shut that's an instruction that can't be followed. The `loggerCount` badge from
`server/src/db/queries/spine.ts` reads "1/2" forever. Worth fixing here or handing to `07`.
