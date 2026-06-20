/**
 * Session middleware + the Hono env that carries the current user.
 *
 * `sessionContext` runs on every request: it reads the session cookie, resolves
 * the user, and stashes it (or null) on the context. `requireAuth` gates routes
 * that need a logged-in user, answering anonymous callers with 401 (this is a
 * JSON API — the Angular client redirects to /login on a 401).
 */
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import { db } from "../db/client";
import { isAtLeast, type Role } from "./roles";
import { getSessionUser, SESSION_COOKIE, type AuthUser } from "./session";

export interface AppEnv {
  Variables: {
    user: AuthUser | null;
  };
}

export const sessionContext = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  c.set("user", token ? getSessionUser(db, token) : null);
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "Unauthorized" }, 401);
  await next();
});

/**
 * Gate a route on a minimum role. Anonymous → 401 (the client redirects to
 * /login); signed-in but under-ranked → 403. `requireTrusted` guards the logging
 * write path; `requireAdmin` guards the admin surface.
 */
export function requireRole(min: Role) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!isAtLeast(user, min)) return c.json({ error: "Forbidden" }, 403);
    await next();
  });
}

export const requireTrusted = requireRole("trusted");
export const requireAdmin = requireRole("admin");
