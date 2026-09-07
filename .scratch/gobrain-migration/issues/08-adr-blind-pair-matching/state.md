# ADR — blind-pair matching as the agreement mechanism

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** — (01 answered)

Two trusted loggers log a run blind and independently; on both submissions the logs are compared
on **finite-field equality with timestamps ignored**: movesets by set equality, events by set
equality, battle order by sequence equality of per-log **ordinals**.

The single most important detail: **ordinals are derived from each log's OWN clock — never a
cross-log timestamp sort.** The two logs' timelines have different origins, so a merged sort is
garbage. Timestamps are still stored (timeline render, jump-to-moment) but never gate agreement.

Record the reasoning chain, which is genuinely non-obvious: consensus-at-5 is wasteful → one
logger plus review → but reviewing is as much work as logging, so reviewers won't show → make
review blind → a blind review just IS a second independent log → consensus, 2-way not 5-way,
justified by trusted-only (trust replaces volume). 2-way has no majority, so ties resolve by
revert-and-reconcile, exactly ONE round, then admin. No third logger, no ping-pong, no fuzzy
timestamp clustering, no AI.

## Scope — per ticket 01's answer

This ADR **owns membership grain**. Ticket 01 resolved: folded in, not standalone. But do NOT
write it the way ticket 01 originally framed it. The correct statement, verified against
`canonical/match.ts`:

- **Submitting a log is a completeness assertion.** Omitting a move asserts it did not occur in
  that video. This is JZ's stated model (2026-09-06) and the ADR must say it in those terms.
- **A fact is set-valued, not counted.** A move logged three times and a move logged once are the
  same fact. Identity fields split facts (`Mimic→Tackle` vs `Mimic→Growl` are two facts, each
  needing two logs).
- **Matching does not contest membership.** `runMatching`: two logs → `agreed`, one log → stays
  `proposed`. Only ordinals (and field-value clashes) reach `contested` automatically.
- **But absence is NOT inert at the record level.** `recomputeRecordState` treats `proposed` and
  `contested` as one unresolved set — `ec.status IN ('proposed','contested')` → `diff`. Nonzero
  `diff` blocks `live`, opens the one reconcile round, then escalates. So a fact only one log
  claims does hold the record out of publication.

That last pair is the trap: a cold agent reading only `match.ts`'s header comment ("absence is
not an assertion") would conclude omission has no consequence. It does — one level up. State
both halves explicitly.

## Acceptance criteria
- One ADR in `docs/adr/`; reconcile-at-5 and the three-tier author→tweak→judge pipeline recorded
  as rejected alternatives.
- Membership grain covered per the Scope section above, including the
  `proposed`-blocks-`live` mechanism.
