# Write up video windowing, per ticket 02

**Type:** task
**Status:** resolved — no-op
**Triage:** —
**Blocked by:** 02 — answered

Execute whatever ticket 02 decided. If it chose "leave it in gobrain", resolve this ticket
immediately as a no-op.

Source material is gobrain `pipeline-and-workbench.md` § VIDEO WINDOWING: rolling window of 3
videos open for claiming, random unlock order, refilling as runs finalize; "3" is a config knob
to tune once the active-logger count is known; random order prevents everyone clustering on
episode 1. No implementation exists in the repo.

## Answer

Ticket 02 chose (c) — leave it in gobrain. **No-op. Nothing is written to the repo.**

Windowing is dead rather than deferred: it existed to get BOTH slots filled on a video, and
single logs are now sufficient for stats. Do not port it to `docs/adr/` as accepted-but-unbuilt;
that would misrepresent a discarded design as a pending one.

## Acceptance criteria
- Matches ticket 02's ruling exactly; marked unbuilt wherever it lands. — n/a, nothing written.
