# 06 — Public /stats route, coming soon

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `06-public-stats-route-placeholder`

**What to build:** a public stats page at a stable URL that anyone can reach without signing in,
saying the real thing is coming. It exists so the site has the shape of its eventual self and so
the URL can be linked before there's data worth charting.

**Blocked by:** None — can start immediately.

Deliberately a placeholder. The real page needs a flattened read layer, which is the first
post-launch build, and it needs runs logged before any aggregate is meaningful. Do not start
deriving stats in this ticket.

- [ ] The stats URL loads for a signed-out visitor
- [ ] It is reachable from the site's normal navigation
- [ ] It states plainly that stats are coming, without promising a date

## Notes

Client-only — no server work, no API call, no guard.

- New `client/src/app/pages/stats.ts` + `stats.html` (separate template file per
  `CODING_STANDARDS.md`).
- Route in `client/src/app/app.routes.ts`, **before** the `**` catch-all.
- Nav: `client/src/app/app.html`. The `<nav>` today only renders inside the signed-in / signed-out
  auth branches — a public link has to sit outside both, next to `.brand`.
- Carries into `10`: nginx needs `try_files $uri $uri/ /index.html` or `/stats` 404s on reload.
