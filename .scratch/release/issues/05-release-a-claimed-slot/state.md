# 05 — Release a claimed logging slot

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `05-release-a-claimed-slot`

**What to build:** the owner of a log, or an admin, can give up a claimed slot so somebody else
can take it. A logger who claims a video and then disappears currently blocks that video for
everyone; after this, the slot goes back to being claimable.

**Blocked by:** None — can start immediately.

The uniqueness constraint on slots already ignores soft-deleted logs, so freeing a slot is a
soft-delete rather than a schema change. Still needed with second logs closed: a stalled *first*
log blocks a video for everyone.

- [ ] A logger can release their own claimed slot
- [ ] An admin can release anyone's slot
- [ ] A released slot can immediately be claimed by a different user
- [ ] A user cannot release someone else's slot
- [ ] Releasing does not hard-delete the log's data

## Notes

Legwork: `legwork.md` — soft-delete is enough (both partial uniques are already scoped to
`deleted_at IS NULL`). One scope call to make first: **draft-only vs. also submitted**. Submitted
drags in the `live` latch + stale `agreed` statuses; `db/ops/reset-editor2.ts` is the reference
for that sequence. Recommends draft-only.
