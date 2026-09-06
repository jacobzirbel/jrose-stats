# 07 — FAQ page

**Status:** ready-for-human
**Branch:** _not started_ — suggested `07-faq-page`

**What to build:** a page explaining what this project is and how logging works, written for
someone who has just redeemed an invite and opened the workbench for the first time. Reachable
from the workbench, so a confused logger doesn't have to leave and search.

**Blocked by:** None — can start immediately.

JZ writes the text — that's the part that needs his knowledge. Deliberately *not* an interactive
tutorial: the in-app guidance gets built later from the questions the first loggers actually ask,
because building it now means guessing at the confusion. Ship prose, watch what people ask in
Discord, then grow it.

- [ ] The page explains what the project is collecting and why
- [ ] It explains that two people log each video independently and don't see each other's work
- [ ] It explains what the logger is expected to record for a run
- [ ] It is linked from the workbench

## Notes

Same shape as `06`: page + separate template + a route before the `**` catch-all. The workbench
link goes in `client/src/app/pages/workbench.html` (top of the page, near the `← back` link).

Prose that already exists and shouldn't be rewritten from scratch:

- `client/src/app/pages/spine-grid.html` — the intro section already explains the three-step
  blind-pair model in JZ's voice.
- `docs/manuals/contribution-lifecycle.md` and `blind-pair-reconciliation.md` — accurate
  mechanics, agent-facing register.

**What a logger is actually required to record** (from `server/src/validation/domain-validators.ts`,
not from memory): Battles is the only `required` category, but submit also enforces — at least one
move per run; all 8 gyms, no duplicates, with gym 1 first, gym 2 second, gym 8 last; and every
non-gym battle (rivals, both Giovannis, Elite Four, Champion) except `rival-1a`. All of it waived
for an `impossible_abandoned` run. Keybinds are `m` / `b` / `e`.

Caveat: if `04` ships closed, don't write "two people log each video" as something happening now.
