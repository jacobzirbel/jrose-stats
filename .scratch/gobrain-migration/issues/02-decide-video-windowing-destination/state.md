# Where does video windowing go?

**Type:** grilling
**Status:** open
**Triage:** ready-for-human
**Blocked by:** —

gobrain `pipeline-and-workbench.md` § VIDEO WINDOWING (session 14) designs a rolling window:
only 3 videos open for claiming at a time, random unlock order, refilling as runs finalize.
Rationale recorded there: with all 151 open a small logger pool scatters, favourites get picked,
and nothing gets BOTH slots filled. "3" is called a config knob.

**No implementation was found in the repo** — slots are claimed first-come with no windowing
gate. So this is design, not documentation of behaviour.

Three options: (a) an ADR marked accepted-but-unbuilt, like the diff-deck one; (b) a note in
`.scratch/release/out-of-scope.md` or a new `.scratch/` ticket, since it's closer to unbuilt
product than to an architectural decision; (c) leave it in gobrain — it may not survive contact
with a real logger pool of unknown size.

Note it interacts with the launch model: slot 2 is gated CLOSED at launch, so windowing has
nothing to do until that gate opens.

## Acceptance criteria
- Destination chosen and recorded under `## Answer`.
- If (a) or (b), ticket 12 picks up the write; if (c), nothing else to do.
