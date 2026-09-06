# 01 — Move picker filters to the run's learnset

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `01-learnset-filtered-move-picker`

**What to build:** when a logger tags a move in the workbench, the picker offers only moves the
run's Pokémon can actually learn, instead of the full move list. Picking a move that Pokémon
can't learn stops being possible in the first place, rather than being caught at submit.

**Blocked by:** None — can start immediately.

This is first because every other logging task is slower and more error-prone without it,
including JZ's own seeding. The validator already rejects unlearnable moves, so today the picker
cheerfully offers choices the submit will refuse.

- [ ] The move picker for a run lists only that Pokémon's learnable moves
- [ ] The count of offered moves visibly differs between two Pokémon with different learnsets
- [ ] The existing unlearnable-move validator still rejects an unlearnable move if one reaches submit by any other path
- [ ] Keyboard-driven flow through the picker is unchanged — no new mouse-only step

## Notes

Legwork: `legwork.md` — where both pickers live, why the learnset lookup rides on
`/api/logs/:videoId/open` rather than `/api/catalog`, and the two things that must NOT be
filtered (Struggle; the mimic `copied-move` field).
