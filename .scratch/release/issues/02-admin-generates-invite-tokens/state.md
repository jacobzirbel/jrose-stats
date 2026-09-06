# 02 — Admin generates invite tokens in a batch

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `02-admin-generates-invite-tokens`

**What to build:** an admin can generate a batch of single-use invite tokens, choosing how many,
and immediately see all of their URLs together in a form that's easy to copy out and send. Each
token records whether it has been redeemed, by whom, and when, plus an optional note so JZ can
remember who he handed it to.

**Blocked by:** None — can start immediately.

Single-use is the whole point: JZ can hand out tokens freely and still cut off a bad actor by
burning their access, with no second token to fall back on. One supply lever, no IP bans and no
alt-account arms race.

- [ ] An admin can request N tokens and get N distinct unredeemed tokens back
- [ ] All generated URLs are displayed together and can be copied in one go
- [ ] Each token shows its status, and once redeemed, who redeemed it and when
- [ ] A non-admin cannot generate tokens
- [ ] An optional note can be attached to a token at generation time

## Notes

Legwork: `legwork.md` — table goes in `schema/core.ts`, the generate/migrate/drift-gate loop, and
the files to touch on both sides. The invite **URL shape** is shared with `03`; settle it once.
