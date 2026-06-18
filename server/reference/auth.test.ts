/**
 * Auth layer (Phase 1C): password hashing + server-side sessions.
 *
 * Sessions are exercised against a fresh in-memory DB migrated with drizzle-kit's
 * actual output (same harness as schema.test.ts), so the session SQL is checked
 * against the real tables, not a hand copy.
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { createSession, deleteSession, getSessionUser } from "../src/auth/session";

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./migrations" });
  sqlite.run(
    "INSERT INTO users (id,username,email,password_hash,role) VALUES (1,'ash','ash@pallet.town','h','member')",
  );
});

test("hashPassword produces a verifiable argon2id hash", async () => {
  const hash = await hashPassword("pikachu123");
  expect(hash.startsWith("$argon2id$")).toBe(true);
  expect(await verifyPassword("pikachu123", hash)).toBe(true);
  expect(await verifyPassword("wrong", hash)).toBe(false);
});

test("createSession then getSessionUser resolves the user without the password hash", () => {
  const token = createSession(db, 1);
  expect(token).toHaveLength(64); // 32 random bytes, hex

  const user = getSessionUser(db, token);
  expect(user).toEqual({
    id: 1,
    username: "ash",
    email: "ash@pallet.town",
    role: "member",
    points: 0,
  });
  expect(user).not.toHaveProperty("passwordHash");
});

test("getSessionUser returns null for an unknown token", () => {
  expect(getSessionUser(db, "nope")).toBeNull();
});

test("getSessionUser returns null once the session is expired", () => {
  const token = createSession(db, 1);
  // Backdate expiry past now.
  sqlite.run("UPDATE sessions SET expires_at = datetime('now','-1 day') WHERE token = ?", [token]);
  expect(getSessionUser(db, token)).toBeNull();
});

test("deleteSession invalidates the token", () => {
  const token = createSession(db, 1);
  expect(getSessionUser(db, token)).not.toBeNull();
  deleteSession(db, token);
  expect(getSessionUser(db, token)).toBeNull();
});
