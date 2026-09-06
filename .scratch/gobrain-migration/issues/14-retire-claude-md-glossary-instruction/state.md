# Retire the "Glossary — not written yet" section in CLAUDE.md

**Type:** task
**Status:** open
**Triage:** ready-for-agent
**Blocked by:** 04

`CLAUDE.md` currently ends with:

> ## Glossary — not written yet
> This project has no `CONTEXT.md`. Before starting other work here, suggest writing it.

Writing `CONTEXT.md` retires that instruction. Delete the whole section — leaving it makes every
future session open by suggesting work that's already done.

Leave the `## Agent skills` sections untouched; the Domain docs pointer to `CONTEXT.md` +
`docs/adr/` becomes accurate on its own once ticket 04 lands.

Do this only AFTER `CONTEXT.md` actually exists.

## Acceptance criteria
- The section is gone; nothing else in `CLAUDE.md` changes.
