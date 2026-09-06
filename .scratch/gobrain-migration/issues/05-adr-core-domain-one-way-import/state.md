# ADR — core→domain one-way import rule

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

The system is two layers with a one-way dependency: **core** is a generic video-logging engine
that knows nothing about Pokémon; **domain** is the Pokémon layer. Every cross-boundary FK points
domain → core, never the reverse.

Capture: the decision, why it was made (core must compile and migrate with `domain/` deleted),
the enforcement points that actually exist (`server/src/validation/` composition root; the schema
barrel; the canonical deriver taking ordinal categories as config rather than importing domain),
and — critically — that **nothing mechanically enforces the import rule**. It is discipline only.
gobrain `out-of-scope.md` lists boundary enforcement as knowingly unfixed.

Cross-link `docs/manuals/core-domain-split.md` rather than restating its three enforcement-point
sections.

Note the verified seam test from gobrain: core DDL creates and operates with zero domain tables
present, and no core table FK-references a domain table (`foreign_key_list` introspection).

## Acceptance criteria
- One ADR file in `docs/adr/`, numbered.
- States the discipline-only nature explicitly — this is the gotcha most likely to be violated.
