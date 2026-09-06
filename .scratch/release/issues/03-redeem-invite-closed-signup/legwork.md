# 03 — legwork

## The open question: email

`users.email` is `notNull().unique()` in `server/src/db/schema/core.ts`, and
`POST /api/signup` (`server/src/routes/auth.ts:32`) requires it. The ticket describes the redeem
form as "username and password" only.

Three ways out, pick one before starting:

1. **Keep asking for email** on the redeem form. Zero schema change, zero migration, and the
   invite is still the gate. Cheapest — recommend this unless JZ objects to collecting it.
2. Make `email` nullable — a core schema change plus a migration, and it touches the table
   everything else FKs to.
3. Synthesise a placeholder (`<username>@invite.local`). Cheap but puts junk in a unique column
   and lies to any future password-reset flow.

Nothing else in the ticket is genuinely ambiguous.

## New accounts land `trusted`

`users.role` defaults to `'member'` in core. The redeem handler must set `'trusted'` explicitly.
Note `auth.ts:65` currently hardcodes `role: "member"` in the **response body** as well as
relying on the column default — both need to be right on the new path.

The role ladder is monotone (`server/src/auth/roles.ts`); `requireTrusted` is the logging gate,
so `trusted` means "can log immediately" with no promotion step, which is AC 1.

## Closing public signup

- `server/src/routes/auth.ts:32` — `POST /api/signup`. This is the path to close. Removing the
  route entirely is cleaner than leaving a 403 stub, but the client calls it from
  `client/src/app/auth.service.ts` (`signup()`), so both move together.
- `client/src/app/app.routes.ts:17` — `{ path: 'signup', component: Signup }`.
- `client/src/app/app.html:14` — the "Sign up" nav link in the signed-out branch.
- `client/src/app/pages/login.ts` — links to `/signup` at the bottom of the form.
- `client/src/app/pages/signup.ts` is the closest model for the new page, but it uses an **inline
  `template:` and `styles:`**, which `CODING_STANDARDS.md` forbids. If it's reworked into the
  redeem page rather than deleted, split the files.

AC 5 (existing accounts still sign in) is untouched by all of this — `POST /api/login` is a
separate handler.

## Single-use

Spending the token and creating the user should be one `db.transaction(...)` so a double-submit
can't produce two accounts. There's a precedent for transactional read-check-write in
`server/src/routes/admin.ts:28–45` (the last-admin guard).

Unlike login, there's no user-enumeration concern here — an unknown/spent token is a plain
"this invite isn't valid" (AC 3). `auth.ts`'s `PHANTOM_HASH` timing dance doesn't apply.
