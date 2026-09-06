# ADR — battles and gyms are ONE ordered category

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

There is a single `battles` category (21 battles, `required=1`, `timestamp_load_bearing=1`).
Gyms are battle catalog items bridged into the domain `gyms` table, which carries
`canonical_order` 1..8 — a **reference** order, explicitly NOT the order taken.

This one matters because gobrain still describes a separate Gyms category and a separate Jokes
category. Neither exists: `static-data.ts:10` seeds exactly `moves`, `battles`, `events`, and
jokes were folded into Events. Any doc or agent reasoning from "the Gyms category" is wrong.

Record the validator split, verified in `server/src/validation/domain-validators.ts`:
- `GymCompletenessValidator` owns gym completeness AND order per run — all 8 distinct gyms, no
  duplicates, and Gen-1's forced bookends (sorted by timestamp: gym 1 first, gym 2 second, gym 8
  last; the middle five are free). Waived for `impossible_abandoned`.
- `BattlesPresentValidator` covers the NON-gym battles.
- `level` and `time` are category-wide fields on every battle.

Also record the two-run case: in a video hosting two Pokémon, the runs are judged independently.
(gobrain once claimed a combined-episode video couldn't pass the gym validators — that was an
unverified guess and is contradicted by the per-run loop in the validator. Do not repeat it.)

## Acceptance criteria
- One ADR in `docs/adr/`; the separate-Gyms-category model recorded as superseded.
