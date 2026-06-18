/**
 * Account API (Phase 1C, JSON): signup / login / logout / me. Sets an httpOnly
 * session cookie; the Angular client never sees the token. No OAuth — password
 * + cookie is all the MVP needs.
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";

import type { AppEnv } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/session";
import { db } from "../db/client";
import { users } from "../db/schema";

export const authRoutes = new Hono<AppEnv>();

const MIN_PASSWORD = 8;

/** Apply the session cookie. `secure` only in production so localhost http works. */
function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days — mirrors the session TTL
  });
}

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const username = String(body.username ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !email || !password) {
    return c.json({ error: "Username, email, and password are required." }, 400);
  }
  if (password.length < MIN_PASSWORD) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const passwordHash = await hashPassword(password);
  let userId: number;
  try {
    const row = db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning({ id: users.id })
      .get();
    userId = row.id;
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Username or email already taken." }, 409);
    }
    throw err;
  }

  setSessionCookie(c, createSession(db, userId));
  return c.json({ user: { id: userId, username, email, role: "member", points: 0 } }, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const user = db.select().from(users).where(eq(users.username, username)).get();
  // Verify even on a missing user to keep timing constant (no enumeration).
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, PHANTOM_HASH);
  if (!user || !ok) {
    return c.json({ error: "Invalid username or password." }, 401);
  }

  setSessionCookie(c, createSession(db, user.id));
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      points: user.points,
    },
  });
});

authRoutes.post("/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(db, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

authRoutes.get("/me", (c) => c.json({ user: c.get("user") }));

// A fixed argon2id hash, used to keep login timing constant when the username
// doesn't exist. Never matches a real password.
const PHANTOM_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$UYbTv8H84IL3PsBPRau/7AyYVkqjUxUlbSKion0PfCo$" +
  "VkFhO9ekNuG2MRhaU1KDlnvhpfFq1tEkbFeLzta1HnU";
