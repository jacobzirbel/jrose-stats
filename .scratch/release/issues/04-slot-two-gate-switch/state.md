# 04 — Admin switch that closes second logs

**Status:** ready-for-agent
**Branch:** _not started_ — suggested `04-slot-two-gate-switch`

**What to build:** a site-wide switch, controlled by an admin, that stops anyone claiming the
second logging slot on any video. While it's closed, loggers can only take first slots, so effort
spreads across many videos instead of two people converging on one. A logger who tries to take a
second slot sees a plain explanation rather than an error. Flipping the switch back open restores
normal behaviour with no data migration.

**Blocked by:** None — can start immediately.

Held closed at launch. There is no site-settings mechanism in the schema today, so this ticket
introduces the smallest one that works — resist building a general feature-flag system.

- [ ] An admin can see the current state of the switch and change it
- [ ] With the switch closed, claiming a second slot is refused with an explanatory message
- [ ] With the switch closed, first slots can still be claimed and logged normally
- [ ] Logs already in progress on a second slot when the switch closes are not destroyed or orphaned
- [ ] Reopening the switch restores second-slot claiming immediately
- [ ] A non-admin cannot change the switch

## Notes
