/**
 * Server-side sessions on the `sessions` table (token PK -> user). The token is
 * an opaque 256-bit random string stored verbatim and handed to the client in
 * an httpOnly cookie; lookups join through to the user and drop expired rows.
 *
 * Functions take a `DB` so they're testable against an in-memory drizzle (same
 * convention as the seed layer). The cookie name lives here so route handlers
 * and middleware agree on it.
 */
import { randomBytes } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import type { DB } from "../db/client";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE = "session";
const SESSION_TTL = "+30 days";

/** The user shape exposed to request context — never includes the password hash. */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  points: number;
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** Mint a session row for `userId` and return its token. */
export function createSession(db: DB, userId: number): string {
  const token = newToken();
  db.insert(sessions)
    .values({
      token,
      userId,
      expiresAt: sql`datetime('now', ${SESSION_TTL})`,
    })
    .run();
  return token;
}

/** Resolve a token to its user, or null if missing/expired. */
export function getSessionUser(db: DB, token: string): AuthUser | null {
  const row = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      points: users.points,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, sql`datetime('now')`)))
    .get();
  return row ?? null;
}

/** Drop a session (logout). Safe to call with an unknown token. */
export function deleteSession(db: DB, token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}
