# ADRs — port the three `rejected/` tombstones

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

These stop future sessions relitigating settled ground, which makes them high-value despite being
about paths not taken. Rewrite each cold — the gobrain versions are layered with session numbers
and reversals that read as contradictions out of context.

**1. Seed-then-refine (JZ seeds slot 1 for all 151).** Dead twice: rejected session 26, then
reconfirmed session 27 — "I'm not logging by myself — it changed." Why: it made JZ the permanent
throughput bottleneck and pushed release indefinitely out. Release is instead invite tokens to a
few co-loggers; all editors equal, slots first-come, JZ is just one logger. It took the "review
JZ's log" UI framing down with it. **Do not revive.**

**2. "Two reviews is the cap — no slot 3."** Retired: JZ wants unlimited **shadow logs**
(slot 3+) that sit outside matching with zero power over `record_state`. The cap's intent
survives narrowly — only slots 1+2 gate liveness; shadows are lenses, never levers.

**3. Stats page derives canonical from single logs.** ⚠️ **UN-rejected, session 27** — write the
current state, not the rejection. The stats page DOES read single-source logs; JZ's reasoning is
that nobody will realistically reverse-engineer a fake log out of derived aggregates, and a bad
attempt would be obvious. What holds now: **two separate visibility gates** — the run detail page
still requires `live` (two logs matched), while the stats page reads everything, using *earliest
submitted log per run, canonical once live*, with no coupling to `runs.status`.

## Acceptance criteria
- Three ADRs in `docs/adr/`, each readable without gobrain and without session numbers as the
  primary framing.
- The stats-page one is unambiguous that the rejection was reversed.
