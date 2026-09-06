# Write `CONTEXT.md` — the glossary

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** 03

The repo has no `CONTEXT.md` and the domain vocabulary is dense and undocumented. This is the
single highest-value artifact in the migration.

**Scope: vocabulary only.** No DDL (the Drizzle schema is truth). No lifecycle narration —
`docs/manuals/{claims-lifecycle,contribution-lifecycle,blind-pair-reconciliation,canonical-facts-derivation}.md`
already tell those stories with `path:line` cites. Link out to them; don't restate them.

Terms to define (verify each against the code before writing it):

- **spine** — the per-Pokémon record across all 151; most rows start empty
- **run** / **attempt** — one Pokémon's solo attempt; `runs.attempt_no` supports re-attempts
- **video**, **run_videos** — many-to-many: a video may host >1 run, a run may span >1 video
- **log** (`video_logs`) — one working doc per (user, video)
- **slot** — 1 or 2 per video; the blind-pair cap, enforced by `video_logs_video_slot_uq`
- **claim** (`event_claims`) — the atom; points at exactly one catalog_item
- **catalog item** / **category** — the vocabulary; categories seeded are `moves`, `battles`,
  `events` (NOT gyms/jokes — those folded in)
- **category field** vs **identity field** (`isIdentity`) — why `Mimic→Tackle` and `Mimic→Growl`
  are two distinct facts rather than one conflicting one
- **membership fact** vs **ordinal fact** — the two assertion identities (`derive.ts:10-23`)
- **canonical**, **standing** (`canonical`/`pending`/`contested`/`overturned`)
- **`record_state`** (`logging → reconciling → escalated → live`, latches) and how it is
  ORTHOGONAL to **`runs.status`** (in-game progress: untouched/in_progress/done/
  impossible_abandoned). Note the grid/detail status is DERIVED (`queries/spine.ts`).
- the seven claim statuses, and the automatic/human dividing line
- **blind pair**, **matching**, the ONE **reconciliation round**, **escalation**
- **proposal**, **contest**, **certify**, **overturn**
- **shadow log** — designed, unbuilt; mark it clearly as such
- **waypoint**, **coverage span** (resume aid only, never a claim unit)
- **placement ceremony** — designed, unbuilt
- **member / trusted / admin** — per ticket 03's answer

Also add a short **Data sources** section, lifted from gobrain `index.md`: the wjsutton
`games_night_viz` CSV is a **DIFFERENT series** (speedrun tier list), side reference only, and
its raw GitHub fetch is robots-blocked; the Smogon "Red & Blue Pre-Evolved Solo Run" thread has
per-post prose gym/move detail. A cold agent will otherwise mistake the CSV for source data.

Finish with a **terms we avoid** section: "gyms category" (it's Battles), "jokes" (Events),
"finalize"/"promote" a record (canonical is derived, never promoted), and — per ticket 03 —
"editor" vs `trusted`.

## Acceptance criteria
- `CONTEXT.md` exists at the repo root, readable cold, no term defined that contradicts the code.
- Every claim about schema/behaviour is verified against `server/src/`, not against gobrain.
- No duplication of `docs/manuals/` content; cross-links instead.
