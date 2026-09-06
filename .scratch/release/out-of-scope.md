# Out of scope

Known and deliberately not being fixed before release. Not forgotten — decided. Each entry says
what breaks if it's left alone.

## Cross-run reopen latch — REAL BUG, unfixed

`server/src/routes/workbench.ts:344` — `reopen` blocks if **any** run hosted by the video is
`live`/`escalated`. In a two-run video (video 14: nidoran-f run 30 + nidoran-m run 33), once run A
goes live neither logger can reopen the shared log to fix run B. Same for `escalated`.

Not hit yet — JZ logged both nidoran runs fine, and with the slot-2 gate closed nothing reaches
`live` at launch. **It bites the first time video 14 gets a second log.** Fix is a one-line
predicate change: scope the check to the run being reopened.

## Multi-run workbench UI

`selectedRunId` starts null in a multi-run video, so claims tagged before picking a run get no
`claim_run` and fail at submit with `ambiguous-run`. The runbar is an invisible mode switch. JZ
logged both runs anyway but called the UI bad. Fixes when it comes up: default `selectedRunId` to
the first run; make the active run visually loud.

## Off-box backups — declined, flagged

SQLite `app.db` on a single droplet with no backup. The logging contributors do is unrecoverable
if that disk dies. Recommended and declined. If it comes back: **pull** from the other VM (cron
SSHes in, `sqlite3 app.db ".backup"`, keeps 7 dailies) rather than push, so the droplet holds no
credentials that could destroy the backups.

## `member` tier cleanup

Every invite redemption lands as `trusted`, so `member` is unreachable via signup and every role
check carries a dead branch. Members can still propose fixes on live runs, so the tier isn't
meaningless. Ripping it out touches role checks across the API for no user-visible gain. Same
trade for renaming `trusted` → `editor` (JZ's word for it).

## N < 3 stat suppression

With few runs logged, an aggregate like "average level facing Brock" is close to a readable
transcript of one run — which risks *anchoring* a second logger rather than cheating. Decide
per-stat when the stats page is actually built, not as a blanket rule now.

## Core→domain boundary enforcement

`schema/core.ts` must never import `schema/domain.ts` (same one-way rule in `validation/` and
`canonical/`). Discipline-only — no lint or test fails the build on a violation. Post-MVP:
`no-restricted-imports` / dependency-cruiser, or a test asserting core compiles and migrates with
the domain layer deleted.
