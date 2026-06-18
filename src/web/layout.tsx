/**
 * Minimal server-rendered shell. The real shell (151-grid spine, nav) lands in
 * Phase 1D — this is just enough chrome for the auth pages and a logged-in
 * landing to prove the cookie round-trips.
 */
import type { FC, PropsWithChildren } from "hono/jsx";

import type { AuthUser } from "../auth/session";

export const Layout: FC<PropsWithChildren<{ title: string; user: AuthUser | null }>> = ({
  title,
  user,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · jrose-stats</title>
    </head>
    <body>
      <header>
        <a href="/">jrose-stats</a>
        {user ? (
          <span>
            {" "}· {user.username} ·{" "}
            <form method="post" action="/logout" style="display:inline">
              <button type="submit">Log out</button>
            </form>
          </span>
        ) : (
          <span>
            {" "}· <a href="/login">Log in</a> · <a href="/signup">Sign up</a>
          </span>
        )}
      </header>
      <main>{children}</main>
    </body>
  </html>
);

/** A bare form-field column. Keeps the auth pages terse. */
export const Field: FC<{ label: string; name: string; type?: string }> = ({
  label,
  name,
  type = "text",
}) => (
  <p>
    <label>
      {label}
      <br />
      <input type={type} name={name} required />
    </label>
  </p>
);
