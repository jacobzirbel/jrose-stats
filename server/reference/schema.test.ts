/**
 * Schema drift-gate (replaces the retired schema_test.py).
 *
 * Migrates a fresh in-memory DB with drizzle-kit's ACTUAL output, then asserts
 * the load-bearing constraints from schema.md still FIRE. This validates what
 * drizzle generated — not a hand-kept SQL copy — so any drift goes red here.
 *
 * Requires migrations to exist: run `bun run db:generate` first.
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";

let sqlite: Database;

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: "./migrations" });
});

// Minimal valid parent rows so the constraint under test is the one that fires.
function seedCore() {
  sqlite.run("INSERT INTO users (id,username,email,password_hash) VALUES (1,'u','e','h')");
  sqlite.run("INSERT INTO videos (id) VALUES (1)");
  sqlite.run("INSERT INTO video_logs (id,user_id,video_id) VALUES (1,1,1)");
  sqlite.run("INSERT INTO categories (id,slug,label) VALUES (1,'moves','Moves')");
  sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label) VALUES (1,1,'tackle','Tackle')");
  sqlite.run("INSERT INTO event_claims (id,log_id,catalog_item_id,timestamp_sec) VALUES (1,1,1,10)");
}

function seedDomain() {
  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (1,'Bulbasaur')");
  sqlite.run("INSERT INTO runs (id,pokemon_dex) VALUES (1,1)");
}

test("foreign_keys pragma is ON for the connection", () => {
  const row = sqlite.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
  expect(row.foreign_keys).toBe(1);
});

test("users.role CHECK rejects an unknown role", () => {
  expect(() =>
    sqlite.run(
      "INSERT INTO users (id,username,email,password_hash,role) VALUES (2,'x','x','h','wizard')",
    ),
  ).toThrow();
});

test("FK rejects a session pointing at a non-existent user", () => {
  expect(() =>
    sqlite.run("INSERT INTO sessions (token,user_id,expires_at) VALUES ('t',999,'2099')"),
  ).toThrow();
});

test("catalog_items (category_id, slug) is UNIQUE within a category", () => {
  seedCore();
  expect(() =>
    sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label) VALUES (2,1,'tackle','Dup')"),
  ).toThrow();
});

test("moves.catalog_item_id bridge is UNIQUE (one move per catalog item)", () => {
  seedCore();
  sqlite.run("INSERT INTO moves (id,catalog_item_id,name) VALUES (1,1,'Tackle')");
  expect(() =>
    sqlite.run("INSERT INTO moves (id,catalog_item_id,name) VALUES (2,1,'TackleAgain')"),
  ).toThrow();
});

test("run_videos composite PK rejects a duplicate (run, video)", () => {
  seedCore();
  seedDomain();
  sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (1,1)");
  expect(() => sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (1,1)")).toThrow();
});

test("runs (pokemon_dex, attempt_no) UNIQUE blocks a duplicate attempt", () => {
  seedDomain();
  expect(() =>
    sqlite.run("INSERT INTO runs (id,pokemon_dex,attempt_no) VALUES (2,1,1)"),
  ).toThrow();
});

test("runs.status CHECK rejects an unknown status", () => {
  seedDomain();
  expect(() =>
    sqlite.run("INSERT INTO runs (id,pokemon_dex,status) VALUES (3,1,'vibing')"),
  ).toThrow();
});

test("claim_run PK attributes at most one run per claim", () => {
  seedCore();
  seedDomain();
  sqlite.run("INSERT INTO claim_run (claim_id,run_id) VALUES (1,1)");
  expect(() => sqlite.run("INSERT INTO claim_run (claim_id,run_id) VALUES (1,1)")).toThrow();
});

test("video_logs partial-unique allows a fresh log after soft-delete", () => {
  sqlite.run("INSERT INTO users (id,username,email,password_hash) VALUES (1,'u','e','h')");
  sqlite.run("INSERT INTO videos (id) VALUES (1)");
  sqlite.run("INSERT INTO video_logs (id,user_id,video_id) VALUES (1,1,1)");

  // a SECOND live log for the same (user, video) is blocked
  expect(() =>
    sqlite.run("INSERT INTO video_logs (id,user_id,video_id) VALUES (2,1,1)"),
  ).toThrow();

  // soft-delete the first, then a fresh live log is allowed
  sqlite.run("UPDATE video_logs SET deleted_at = datetime('now') WHERE id = 1");
  expect(() =>
    sqlite.run("INSERT INTO video_logs (id,user_id,video_id) VALUES (3,1,1)"),
  ).not.toThrow();
});

test("deleting a video_log cascades to event_claims and claim_run", () => {
  seedCore();
  seedDomain();
  sqlite.run("INSERT INTO claim_run (claim_id,run_id) VALUES (1,1)");

  sqlite.run("DELETE FROM video_logs WHERE id = 1");

  const claims = sqlite.query("SELECT COUNT(*) AS n FROM event_claims").get() as { n: number };
  const claimRuns = sqlite.query("SELECT COUNT(*) AS n FROM claim_run").get() as { n: number };
  expect(claims.n).toBe(0);
  expect(claimRuns.n).toBe(0); // cascade reached domain through event_claims
});
