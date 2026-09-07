# Is set-membership grain its own ADR?

**Type:** grilling
**Status:** resolved
**Triage:** —
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

## Answer

**Folded into 08 — but the framing above is misleading and must not be carried into the ADR.**

JZ's position, stated 2026-09-06: submitting a log IS a completeness assertion. Omitting Growl
asserts Growl did not occur in that video. Membership sets must line up before a record
publishes. He asked whether the code already does this.

**It does — via `proposed`, not via `contested`.** Verified against `canonical/match.ts`:

- `runMatching` keys membership facts by `catalog_item_id` + identity-field values. A fact two
  logs claim → `agreed`; a fact ONE log claims → stays `proposed`. Matching never marks a
  membership fact `contested` on absence alone. The header comment's "absence is not an
  assertion" is accurate *about matching*.
- `recomputeRecordState` then treats `proposed` and `contested` as the SAME unresolved set:
  `ec.status IN ('proposed','contested')` counts as `diff`. Any nonzero `diff` blocks `live`,
  opens the one `reconciling` round, and escalates to admin if that round fails.

So a one-sided membership claim does hold the record out of `live` exactly as JZ intends. The
enforcement lives in the lifecycle, not in matching. **No bug; no code change.**

The residual divergence is labelling, not correctness: a one-sided membership fact and a real
ordinal conflict are both unresolved but carry different statuses, so the reconcile UI shows
`proposed` where JZ's mental model says "the logs disagree." UX question if it ever bites, not a
modelling one.

Consequence for ticket 08: the ADR must state the completeness rule and the
`proposed`-blocks-`live` mechanism outright. A cold agent reading only `match.ts`'s header would
conclude absence is inert, which is wrong at the record level.

## Acceptance criteria
- A one-line answer under `## Answer`: standalone ADR, or folded into 08. — done
- Map's Decisions-so-far updated. — done
