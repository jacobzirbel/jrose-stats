# Release — state

**Overall:** not started, apart from `08` (three runs logged). Nothing built, nothing deployed.

**Spec:** `spec.md`. Declined items: `out-of-scope.md`. This directory is authoritative; the
gobrain namespace mirrors it for chat sessions and holds the history.

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Move picker filters to learnset | — |
| 02 | Admin generates invite tokens | — |
| 04 | Slot-2 gate switch | — |
| 05 | Release a claimed slot | — |
| 06 | `/stats` placeholder | — |
| 07 | FAQ page | — |
| 08 | Log three runs | — · **done** |
| 03 | Redeem invite, close signup | 02 |
| 09 | Prove the reconcile path | 03, 04 |
| 10 | Deploy to a public URL | 03, 04, 05, 06, 07 |
| 11 | Hand out invite tokens | 09, 10 |

Six are startable today. `01` gates nothing — quality-of-life for everyone logging from here on,
droppable if invites matter more.

## Open decisions

- **Domain name.** Shape settled — generic apex, this site on a `jrose.` subdomain. Blocks `10`.
- **Where site-wide config lives.** Nothing in the schema does this yet. A design call for `04`,
  not a research task.

## Notes
