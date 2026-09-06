# Does CONTEXT.md record the pending `trusted`→`editor` rename?

**Type:** grilling
**Status:** open
**Triage:** ready-for-human
**Blocked by:** —

The role ladder in code is `member → trusted → admin` (`server/src/db/schema/core.ts:38`,
`users_role_chk`). JZ calls the middle tier "editor" in conversation and wants the rename
eventually. gobrain's `schema.md` already writes `('member','editor','admin')` as if it shipped
— which is exactly the kind of drift this migration exists to stop.

Options: record the ladder as `member/trusted/admin` **plus** a "JZ calls this editor; rename
pending" note (recommended — a cold agent hitting `requireTrusted` in the middlware and "editor"
in chat needs the bridge); or document only what ships and stay silent until the rename lands.

Blocks ticket 04 because it changes what the glossary's role entry says.

## Acceptance criteria
- Answer recorded; ticket 04 writes the role entry accordingly.
