# Sweep `journal/` for decisions that never landed anywhere durable

**Type:** research
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

gobrain `journal/` holds 18 session files, plus `archived/` and `todo/`. The working assumption
is that all of it is history and stays put. That assumption is **unverified** — nobody has read
them against the migrated set.

Cheap insurance: read them looking only for decisions that are (a) still in force and (b) not
already captured in `CONTEXT.md`, an ADR from this effort, `.scratch/release/`, or
`docs/manuals/`. Note that `todo/reconciliation-and-canonical.md` is referenced repeatedly by
`schema.md` as holding the resolved reconciliation model — check whether it says anything the
canonical ADR (07) and the manuals don't.

Expect the answer to be "nothing new". Report findings as a list; do not migrate anything
directly — anything found gets its own ticket.

## Acceptance criteria
- A findings list under `## Answer`, one line per orphan decision or an explicit "none found".
- No files written outside this ticket.
