/**
 * Test-account seed: one of each role so every tier is exercisable in dev.
 * Username == password (don't ship these to production). Idempotent via
 * onConflictDoNothing on the unique username — re-run freely.
 *
 *   admin    / admin    → admin   (manages users, resolves the queue)
 *   editor1  / editor1  → trusted (can claim a slot + log)
 *   editor2  / editor2  → trusted (the blind-pair partner)
 *   member   / member   → member  (view + contest/propose on live runs)
 */
import { hashPassword } from "../../auth/password";
import type { DB } from "../client";
import { users } from "../schema";

const SEED_USERS: { username: string; role: "member" | "trusted" | "admin" }[] = [
  { username: "admin", role: "admin" },
  { username: "editor1", role: "trusted" },
  { username: "editor2", role: "trusted" },
  { username: "member", role: "member" },
];

export async function seedUsers(db: DB): Promise<number> {
  const rows = await Promise.all(
    SEED_USERS.map(async ({ username, role }) => ({
      username,
      email: `${username}@local`,
      passwordHash: await hashPassword(username),
      role,
    })),
  );
  db.insert(users).values(rows).onConflictDoNothing().run();
  return rows.length;
}
