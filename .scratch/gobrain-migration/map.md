# Map — draining the `jrose-stats` gobrain namespace into the repo

**Goal:** a fresh agent can work in this repo without booting gobrain. The design memory that
still matters becomes `CONTEXT.md` (vocabulary) + `docs/adr/` (hard-to-reverse decisions);
everything else stays in gobrain as history.

**Not in scope:** `.scratch/release/` (already migrated, authoritative), `docs/manuals/`
(8 human-targeted files with `path:line` cites — do not duplicate into them).

## Notes

**Migrate meaning, not files.** gobrain markdown is session-by-session sediment written for a
Claude that already had context. Everything here gets rewritten for someone reading cold. No
wholesale copies.

**The code is truth, and gobrain is measurably behind it.** Verified 2026-09-05 against
`server/src/db/schema/{core,domain}.ts`, `server/src/canonical/{match,derive}.ts`,
`server/src/validation/domain-validators.ts`, `server/src/db/seed/static-data.ts`:

| gobrain `schema.md` claims | the code does |
| --- | --- |
| `role IN ('member','editor','admin')` | `('member','trusted','admin')` — `core.ts:38`. The rename is unshipped; gobrain wrote the aspiration as DDL. |
| categories: Moves / Gyms / Jokes / Battles | three: `moves`, `battles`, `events` — `static-data.ts:10`. Gyms folded into Battles, Jokes into Events. |
| Gyms is the `required` category | `battles` is; gyms are battle items bridged via the domain `gyms` table |
| `category_fields` has no identity concept | `isIdentity` exists and is load-bearing (`Mimic→Tackle` vs `Mimic→Growl` = two facts, not a conflict) |
| two domain validators | four: Learnset, GymCompleteness, MovesPresent, BattlesPresent |
| one `category_fields` uniqueness index (coalesce sentinel) | two partial indexes — drizzle-kit can't render an expression inside `.on()` |

Consequence: **`schema.md` is not migrated as DDL.** The Drizzle file already carries better
prose than gobrain does. What's worth saving is the reasoning the code doesn't hold — why the
3-FK discriminator died, why gym de-dup can't be a partial unique index, why `brock_sec` left
`run_stats`. That reasoning lands in ADRs, not in a schema doc.

**Precedent for distrusting gobrain:** a prior session asserted a combined-episode video
couldn't pass the gym validators. That was an unverified guess. Verify every claim against the
code before writing it into the repo. *Second instance, 2026-09-06:* ticket 01 was written from
`match.ts`'s header comment alone and framed absence as having no consequence. Reading
`recomputeRecordState` in the same file showed the opposite at the record level. Read the whole
file, not the docstring.

**Two gotchas to carry into whatever gets written:**
- Never `db.get(sql\`\`)` with drizzle bun-sqlite — it returns a positional array. Use
  `db.all(sql\`\`)[0]`. The SELECT-builder `.get()` is fine.
- `schema/core.ts` must never import `schema/domain.ts`. Discipline only; nothing enforces it.

**Working rules:** JZ runs all build/db/seed/migrate commands — hand them over rather than
running them. Cheap `tsc`/`bun test` is fine. Don't commit unless asked.

## Decisions so far

- **Destination split (proposed 2026-09-05, JZ reviewing):** `CONTEXT.md` = glossary only, no
  DDL and no lifecycle narration (the manuals own that). `docs/adr/` = one ADR per
  hard-to-reverse decision, including one per `rejected/` tombstone.
- **`schema.md` does not become a repo file.** Superseded by the Drizzle schema; its reasoning
  is redistributed into ADRs. See the drift table above.
- **`docs/manuals/` is off limits** — it already covers the core/domain split, claims lifecycle,
  blind-pair reconciliation, and canonical derivation with line cites.
- **Most of `roadmap/`, `launch-checklist.md`, `launch-readiness-review.md`,
  `launch-blockers.md` stays in gobrain** — superseded by `.scratch/release/`.
- **`journal/` (18), `archived/`, `todo/` stay in gobrain.** History, not reference.
- **The stats-page tombstone is UN-rejected** (gobrain session 27) — the stats page reads
  single-source logs. Its ADR must record the reversal, not the original rejection.
- **Membership grain folds into ticket 08** (JZ, 2026-09-06), with a corrected framing: a log is
  a completeness assertion, and while matching leaves one-sided membership at `proposed` rather
  than `contested`, `recomputeRecordState` counts `proposed` as unresolved — so omission does
  block `live`. No code change. See ticket 01.
- **Video windowing is dead, not deferred** (JZ, 2026-09-06). It existed to get both slots filled
  on a video; single logs are now sufficient for stats, so the premise is gone. Stays in gobrain;
  ticket 13 is a no-op. See ticket 02.

## Fog

- Does `CONTEXT.md` record the pending `trusted`→`editor` rename, or stay silent until it
  ships? Leaning record-it: the mismatch is exactly what trips a cold agent. → ticket 03.
- Does gobrain's `schema.md` get a "superseded, see the repo" banner once this lands, or is it
  left to rot? → ticket 15.
- Unknown whether anything in `journal/` (18 files) holds a decision that never made it into a
  durable doc. Nobody has swept it. → ticket 12.
