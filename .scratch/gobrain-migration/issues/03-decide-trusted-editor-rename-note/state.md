# Does CONTEXT.md record the pending `trusted`→`editor` rename?

**Type:** grilling
**Status:** resolved
**Triage:** —
**Blocked by:** —

The role ladder in code is `member → trusted → admin` (`server/src/db/schema/core.ts:38`,
`users_role_chk`). JZ calls the middle tier "editor" in conversation and wants the rename
eventually. gobrain's `schema.md` already writes `('member','editor','admin')` as if it shipped
— which is exactly the kind of drift this migration exists to stop.

Options: record the ladder as `member/trusted/admin` **plus** a "JZ calls this editor; rename
pending" note (recommended — a cold agent hitting `requireTrusted` in the middlware and "editor"
in chat needs the bridge); or document only what ships and stay silent until the rename lands.

Blocks ticket 04 because it changes what the glossary's role entry says.

## Answer

**Document `member/trusted/admin`. No bridge note. No pending-rename language.**

JZ, 2026-09-06: "I don't care if it's trusted or editor." The rename was never a real intention —
just conversational drift — so there is no pending change to record. `CONTEXT.md` states the
ladder as the code has it and says nothing further.

The ticket's own recommendation (record the rename as pending) is **rejected**: documenting a
rename nobody has committed to is precisely how gobrain's `schema.md` came to assert
`('member','editor','admin')` as shipped DDL. Do not reintroduce the drift in a softer form.

Residual risk, accepted as small: a cold agent may encounter "editor" in an old gobrain file and
wonder. Ticket 15's supersession banners cover that if they happen; nothing else is needed.

## Acceptance criteria
- Answer recorded; ticket 04 writes the role entry accordingly. — done
