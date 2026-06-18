/**
 * Landing route. Proves the session cookie round-trips end to end; the 151-grid
 * spine shell replaces this body in Phase 1D.
 */
import { Hono } from "hono";

import type { AppEnv } from "../auth/middleware";
import { Layout } from "../web/layout.tsx";

export const homeRoutes = new Hono<AppEnv>();

homeRoutes.get("/", (c) => {
  const user = c.get("user");
  return c.html(
    <Layout title="Home" user={user}>
      {user ? (
        <p>
          Logged in as <strong>{user.username}</strong> ({user.role}). The spine grid lands in
          Phase 1D.
        </p>
      ) : (
        <p>
          A community-built database of Jrose's all-151 solo runs.{" "}
          <a href="/signup">Sign up</a> to start logging.
        </p>
      )}
    </Layout>,
  );
});
