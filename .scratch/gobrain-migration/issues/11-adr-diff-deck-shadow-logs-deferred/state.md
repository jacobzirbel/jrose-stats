# ADR — diff deck + shadow logs (accepted, not implemented)

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** —

From gobrain `reconcile-ux-report.md` § Session 26. This design is **settled but unbuilt** —
deferred, not dead. It needs an ADR precisely so nobody redesigns it from scratch. Mark the
status clearly as accepted-but-unimplemented.

- **Reconcile = a one-card-at-a-time diff deck.** One difference at a time, video auto-seeked to
  the other logger's timestamp before you answer. Card types: presence, inverse presence, value
  differs, order (shows both sequences at the first divergence — not a yes/no).
- **"Agree" = accept theirs, one click**, legitimized by the forced seek: you agree with the
  tape, not with the partner.
- **Placement ceremony** (universal: reconcile accepts, shadow raises, timestamp fixes): prefill
  their timestamp → scrub with the existing keyboard transport keys → confirm → submit THAT item.
  No batch submit anywhere; N issues = N re-watches. **The friction is the point.** Accepted
  claims land at the confirmed spot, never as a copy of theirs, and you never edit the other
  logger's row.
- **Shadow logs (slot 3+, unlimited):** a full logging pass outside matching, zero power over
  `record_state`, purely to help people find differences. Diffs render in the same panel; a
  per-row "raise this" walks the existing contest/propose doors one item at a time.

**Known blocker, verified:** `video_logs_video_slot_uq` in `server/src/db/schema/core.ts` caps a
video at 2 live slots, and `video_logs_slot_chk` restricts `slot` to `(1,2)`. Shadow logs need a
slot ≥3 or a parallel mechanism, and must be excluded from `runMatching`.

Also note the one deriver rule it implies: a placement-confirmed timestamp becomes the canonical
display timestamp for an agreed fact. Matching stays timestamp-blind regardless — the precision
only buys the admin a jump-to-moment link.

Keep the *audit* half of `reconcile-ux-report.md` in gobrain; only the settled design migrates.

## Acceptance criteria
- One ADR in `docs/adr/` marked accepted-but-unbuilt, with the slot-cap blocker named.
