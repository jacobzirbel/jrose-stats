# Decide what gobrain gets told about the migration

**Type:** grilling
**Status:** open
**Triage:** ready-for-human
**Blocked by:** 04, 05, 06, 07, 08, 09, 10, 11

Once the meaning is in the repo, gobrain's copies become traps — a future session that boots the
namespace will read `schema.md`'s stale DDL (wrong role CHECK, wrong categories, missing
`isIdentity`) and believe it.

`launch-blockers.md` and `state.md` already carry banners pointing at `.scratch/release/`, so
there's precedent for the pattern. Candidates for a "superseded — see the repo" banner:
`schema.md` (highest value: it is actively wrong), `pipeline-and-workbench.md`,
`reconcile-ux-report.md`, `rejected/`, `index.md`.

JZ's call on whether to spend the writes, and whether gobrain's `state.md` § "Where truth lives"
should be rewritten to point at `CONTEXT.md` + `docs/adr/` instead.

Blocked until the repo-side docs exist — there's nothing to point at before then.

## Acceptance criteria
- Answer recorded; if yes, the banner writes happen in this ticket (gobrain-side only, no repo
  changes).
