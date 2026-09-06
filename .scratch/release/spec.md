# Release — spec

**Release means:** invite tokens in the hands of a few people who help JZ log. Not a public
contributor launch, and not a finished stats page.

**This directory is the source of truth for the release.** `state.md` tracks position, `issues/`
holds the tickets, `out-of-scope.md` records what was knowingly declined.

The `jrose-stats` gobrain namespace mirrors this for Claude chat sessions and keeps the history —
journals, rejected paths, and the reasoning behind the schema. When the two disagree, this
directory wins.

## The model

- **Blind pairs stay.** Two loggers, two slots, blind.
- **All editors are equal.** Slots are first-come for any trusted user; JZ is just one logger.
- **Slot 2 is gated closed at launch** by an admin switch. Phase A is breadth-first first-logs
  only. JZ opens it when he decides.
- **Two separate visibility gates:**
  - **Run detail page** stays gated on `record_state = live` (two logs matched).
  - **Stats page reads everything**, including single-source first logs.
- **Stats read rule:** take the earliest submitted log per run; once the run is live, take
  canonical instead. No coupling to run status — validators already force a submitted log to be
  a complete run.

## Consequence, accepted deliberately

With slot 2 closed, no run reaches `live` at launch. No run detail page is publicly visible,
reconciliation does not run in production, and the stats page is the entire public surface.

## Out of scope

See `out-of-scope.md`.
