# ADR — canonical is a derived view, never a promoted record

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

There is ONE claims table. Canonical is computed over it — nothing is ever promoted into a
second "canonical" record, and "agreed" is a status the matcher derives, not a row anyone flips.

Why it matters to a future agent: the instinct to add a `canonical_facts` table is strong and
would be a large, hard-to-reverse mistake. Also record that per-claim provenance is retained by
construction, and that authority is deliberately NOT a weight on a claim — who made a claim never
ranks it; that's a write-path permission question (`derive.ts:1-30`).

Canonical = `{agreed, certified}`; queue = `{contested}`; `{overturned}` shows as rejected;
`{draft, retracted}` are filtered before grouping.

Cross-link `docs/manuals/canonical-facts-derivation.md`.

**Open when writing:** whether the "membership grain / absence is not an assertion" rule lands
here or in ticket 08 — see ticket 01.

## Acceptance criteria
- One ADR in `docs/adr/`; the "second table" alternative is recorded as rejected.
