# Write up video windowing, per ticket 02

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** 02

Execute whatever ticket 02 decided. If it chose "leave it in gobrain", resolve this ticket
immediately as a no-op.

Source material is gobrain `pipeline-and-workbench.md` § VIDEO WINDOWING: rolling window of 3
videos open for claiming, random unlock order, refilling as runs finalize; "3" is a config knob
to tune once the active-logger count is known; random order prevents everyone clustering on
episode 1. No implementation exists in the repo.

## Acceptance criteria
- Matches ticket 02's ruling exactly; marked unbuilt wherever it lands.
