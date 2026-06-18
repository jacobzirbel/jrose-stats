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
