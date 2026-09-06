# 05 — legwork

## The mechanism is already in the schema

`server/src/db/schema/core.ts:130–137` — both partial unique indexes on `video_logs` are scoped
`WHERE deleted_at IS NULL`:

- `video_logs_user_video_uq` on `(user_id, video_id)`
- `video_logs_video_slot_uq` on `(video_id, slot)`

So `UPDATE video_logs SET deleted_at = datetime('now')` frees the slot *and* lets the same user
start fresh later. No schema change, and AC 5 (no hard delete) holds by construction. Every
derivation — `canonical/match.ts`, `db/queries/spine.ts`, `routes/canonical.ts` — already filters
`vl.deleted_at IS NULL`, so a released log disappears from reads with no extra work.

The claim path re-picks the freed slot at `server/src/routes/workbench.ts:137`
(`[1,2].find(s => !taken.includes(s))`) — AC 3 needs nothing beyond the soft-delete.

## Scope decision: draft-only, or submitted too?

**This is the call to make first.** Releasing a *draft* log is trivial. Releasing a **submitted**
log is not, and `server/src/db/ops/reset-editor2.ts` documents exactly why (read its header):

1. `record_state = 'live'` **latches** — `recomputeRecordState` returns early at
   `server/src/canonical/match.ts:189`. Removing a log can't downgrade a live run unless the
   latch is cleared first.
2. The surviving logger's claims keep their stale `agreed` status. `runMatching` has to re-run
   so single-source facts fall back to `proposed`.

So the submitted case is: clear the latch → `runMatching(db, runId)` → `recomputeRecordState(db,
runId)`, per run of the video. `reset-editor2.ts` is a working reference implementation of that
sequence.

**Recommendation: restrict release to `status = 'draft'` logs.** The ticket's motivating case is
"claims a video and then disappears" — that's a draft. Draft-only sidesteps the latch entirely
and the run stays in `logging` (`recomputeRecordState` still worth calling for the submitted
count). Say so explicitly in the ticket rather than leaving it implied.

## Route

New handler in `server/src/routes/workbench.ts`, e.g. `POST /api/logs/:logId/release`.

Guard: use `requireAuth` plus an in-handler role check, following
`server/src/routes/review.ts:57–63` — the ownership rule ("your own, or admin") doesn't fit a
single rank guard. `requireTrusted` alone would technically admit admins (the ladder is
monotone, `server/src/auth/roles.ts`) but wouldn't express "or admin" for someone else's slot.

AC 4 (can't release someone else's) is the same 404/403 shape as the ownership checks already in
this file — `ownedDraft()` at `workbench.ts:422` is the existing helper.

## Client

- `client/src/app/workbench.service.ts` — add `release(logId)` alongside `reopen`.
- The logger-facing control belongs on the workbench page
  (`client/src/app/pages/workbench.ts` / `.html`), near the existing submit/reopen controls.
- The admin-facing one has no obvious home yet; the admin console
  (`client/src/app/pages/admin/`) surfaces runs and users but not logs. Simplest is to let an
  admin hit the same button from the workbench.
- `client/src/app/pages/pokemon-detail.html` shows the `loggerCount` badge that should drop back
  after a release — good manual check for AC 3.
