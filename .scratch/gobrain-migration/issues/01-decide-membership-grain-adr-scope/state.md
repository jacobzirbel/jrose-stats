# Is set-membership grain its own ADR?

**Type:** grilling
**Status:** open
**Triage:** ready-for-human
**Blocked by:** —

The proposed ADR list has "set-membership grain, not counts — absence is not an assertion" as a
standalone decision. It may instead be a *consequence* of how blind-pair matching works rather
than an independently made choice.

Evidence for folding it in: `match.ts:1-18` derives it directly from the matching rule — "two
logs never *contradict* on membership, so matching alone can't make a membership fact
`contested`." Evidence for standalone: it's the reason a move logged three times and a move
logged once are the same fact, which is a modelling decision a future agent could plausibly try
to reverse without touching matching at all.

JZ's call. This blocks ticket 08 (the matching ADR) because the answer decides that ADR's scope.

## Acceptance criteria
- A one-line answer under `## Answer`: standalone ADR, or folded into 08.
- Map's Decisions-so-far updated.
