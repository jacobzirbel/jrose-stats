# 03 — Redeem an invite to create an account; public signup closed

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `03-redeem-invite-closed-signup`

**What to build:** someone with an invite URL opens it, sets a username and password on that
page, and lands in the workbench with a working account that can already log. The token is spent
in the process and won't work a second time. There is no other way to create an account — the
existing public signup path stops accepting new accounts entirely.

**Blocked by:** 02 (admin generates invite tokens)

New accounts arrive already trusted, i.e. able to log immediately. There is no waiting room and
no separate promotion step. Reviewing — contesting facts and proposing fixes — stays open to any
signed-in user; the gate is on account creation, not on review.

- [ ] Opening a valid invite URL presents a signup form and creates an account that can log without any further promotion
- [ ] The same invite URL cannot be used twice
- [ ] An invalid, unknown, or already-redeemed token gives a clear message and creates nothing
- [ ] There is no way to create an account without a valid token
- [ ] Existing accounts can still sign in normally

## Notes

Legwork: `legwork.md` — every file on the close-public-signup path, plus the one real decision:
`users.email` is NOT NULL and the redeem form as specced only asks for username + password.
Recommendation there is to keep asking for email (no core schema change).
