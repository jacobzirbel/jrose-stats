# ADR — everything-is-a-catalog-item

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

A claim points at exactly one `catalog_item_id` (NOT NULL) and reaches its category by join.
Gyms and moves ARE catalog items; the `moves`/`gyms` tables are domain lookups that bridge into
core by a `UNIQUE catalog_item_id`.

The decision this replaced is the valuable part: `event_claims` used to carry a 3-FK
discriminator — `event_type ∈ {catalog,move,gym}` plus `catalog_item_id|move_id|gym_id` plus an
exactly-one CHECK. Collapsing it to a single FK removed all domain knowledge from core.

Also record the consequences that are non-obvious and were paid for:
- `catalog_items.slug` uniqueness narrowed from global to `UNIQUE(category_id, slug)` — a move
  and a gym may legitimately share a slug.
- Gym de-dup and completeness **cannot** be DB constraints post-split: a category-scoped partial
  unique index needs a subquery in its WHERE, which SQLite forbids. They moved into
  `GymCompletenessValidator`. This was verified, not assumed.
- Moves repeat — `uq_move_per_log` is dropped. A move claim answers "did this happen", and
  zero-vs-one-or-more rows answers it. Formalized as the category's `timestamp_load_bearing=0`.

## Acceptance criteria
- One ADR in `docs/adr/`; the dead 3-FK discriminator is recorded as the rejected alternative.
