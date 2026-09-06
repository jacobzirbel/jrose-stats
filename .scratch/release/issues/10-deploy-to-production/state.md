# 10 — Deploy to a public URL

**Status:** ready-for-human
**Branch:** _not started_ — suggested `10-deploy-to-production`

**What to build:** the site running on a real domain over HTTPS, on a small VM, with a repeatable
way to push a new version. Today the repo has no deployment artifacts of any kind — no web server
config, no service definition, no deploy script.

**Blocked by:** 03 (redeem an invite), 04 (slot-2 gate switch), 05 (release a claimed slot), 06 (public stats route), 07 (FAQ page)

Shape decided: 1 CPU / 1 GB VM, nginx terminating TLS, the API running as a managed service, and
the client **built locally and copied up** — a 1 GB box will very likely run out of memory
building the Angular app, and the swap workaround is slow enough to be miserable. The VM should
run only the API and the web server.

Deploys are manual — no deploy-on-push. Database migrations stay a separate manual step, because
a bad migration against the live database is the one failure that redeploying doesn't undo.

**Prerequisite outside this ticket:** the domain has to be bought. Shape is settled — a generic
name that isn't JZ's and isn't specific to this project, with this site on a `jrose.` subdomain
so the apex stays free for whatever's next. The name itself is not chosen.

- [ ] The site loads over HTTPS on the real domain for a signed-out visitor
- [ ] The API survives a VM reboot without manual intervention
- [ ] A new version can be deployed with a single documented command
- [ ] Migrations are run by a separate explicit step, never as a side effect of deploying
- [ ] The client is built off the VM

## Notes
