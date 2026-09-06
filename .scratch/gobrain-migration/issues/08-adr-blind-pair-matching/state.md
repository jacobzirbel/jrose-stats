# ADR — blind-pair matching as the agreement mechanism

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** 01

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

Per ticket 01, this ADR may also own: membership grain — a fact is set-valued, absence is not an
assertion, so two logs can never *contradict* on membership and matching alone cannot contest a
membership fact (only ordinals can). Check 01's answer first.

## Acceptance criteria
- One ADR in `docs/adr/`; reconcile-at-5 and the three-tier author→tweak→judge pipeline recorded
  as rejected alternatives.
- Scope matches ticket 01's ruling.
