# 09 — legwork

## Pick a single-run video

`out-of-scope.md` records two known workbench bugs, and **both only bite on multi-run videos**:

- the cross-run reopen latch (real location: `server/src/routes/workbench.ts:344` — `out-of-scope.md`
  says `server/src/api/workbench.ts`, which doesn't exist; the line number is right)
- `selectedRunId` starting null, producing `ambiguous-run` at submit

Video 14 (nidoran-f run 30 + nidoran-m run 33) is the known 2-run video. Don't use it for this
exercise. A single-run video sets `selectedRunId` automatically
(`client/src/app/pages/workbench.ts:318`) and the reopen predicate can only see one run.

## The path, end to end

1. Second logger opens `/log/:videoId` → `POST /api/logs/:videoId/open` claims slot 2
   (`workbench.ts:131–144`).
2. Logs blind, then `POST /api/logs/:logId/submit`. On submit, `runMatching` +
   `recomputeRecordState` fire for every run the video hosts (`workbench.ts:310–320`).
3. The diff surfaces in the workbench's reconcile panel — `showReconcile()` / `diffLines()` in
   `client/src/app/pages/workbench.ts` (~`:150–265`), rendered at `workbench.html:37+`.
4. Each logger fixes their own log: `POST /api/logs/:logId/reopen` → edit → resubmit.
5. Run latches `live` when the diff is empty **and** there's at least one agreed fact
   (`server/src/canonical/match.ts:214–226`).
6. Public detail page: `GET /api/runs/:runId/canonical` drops its visibility gate once
   `recordState === 'live'` (`server/src/routes/canonical.ts:31–40`). Check `/run/:runId`
   **signed out** — that's AC 3, and the gate is the only thing being proven.

## Know this before you start

- **There is exactly ONE reconciliation round.** `logging` → (diff) → `reconciling`; a diff that
  survives that round goes to `escalated`, not to a second round
  (`match.ts:218–225`). If the two of you don't converge on the first pass, the run lands in the
  admin queue, not back in reconciliation.
- Escape hatch: `POST /api/runs/:runId/reconcile/escalate`
  (`server/src/routes/reconcile.ts:32`) — requires state `reconciling`, loggers only.
- `live` latches. Once there, it can't be recomputed back down without the manual latch-clear
  that `server/src/db/ops/reset-editor2.ts` performs.
- Two *empty* logs won't publish — `agreed > 0` is required (`match.ts:214–222`).

## If you rehearse this locally first

`server/data/app.db` is dev seed data, and it is **not clean for this**:

- `editor2` (user 3) already holds **slot-2 draft logs on videos 1, 2, 8, 9** — exactly the slots
  a real second person would need.
- `editor1` (user 2) holds ~20 submitted slot-1 logs.
- No run is `live` or `reconciling` today; every run is `logging`.

`server/src/db/ops/reset-editor2.ts` exists to clear that (dry-run by default, `--apply` to
mutate, and it prints a `cp data/app.db data/app.db.bak` reminder). Production starts from an
empty DB, so this only matters for a local rehearsal.

Seeded accounts are `admin` / `editor1` / `editor2` / `member`, username == password
(`server/src/db/seed/users.ts`).

## Ordering

AC 5 closes the slot-2 gate afterwards. That means `04` must be **built and deployed but left
open** for this exercise — closing it is the last step of `09`, not part of `04`.
