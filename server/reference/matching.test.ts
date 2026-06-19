/**
 * Matching process (Phase 2). Seed two submitted blind logs, run matching, and
 * assert the automatic transitions: shared membership → agreed, single-log →
 * proposed, gym order agree → agreed / disagree → contested, and that a
 * human-set status (certified) is never overwritten.
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { recomputeRecordState, runMatching } from "../src/canonical/match";
import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const statusOf = (id: number) =>
  (sqlite.query("SELECT status FROM event_claims WHERE id = ?").get(id) as { status: string }).status;

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./migrations" });

  sqlite.run("INSERT INTO users (id,username,email,password_hash) VALUES (1,'a','a','h'),(2,'b','b','h')");
  sqlite.run("INSERT INTO categories (id,slug,label) VALUES (1,'events','Events'),(2,'gyms','Gyms')");
  sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (1,1,'joke-a','Joke A','active'),(2,1,'joke-b','Joke B','active')");
  for (let g = 1; g <= 3; g++) {
    sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (?,2,?,?,'active')", [10 + g, `gym${g}`, `Gym ${g}`]);
  }
  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (1,'Bulbasaur')");
  sqlite.run("INSERT INTO runs (id,pokemon_dex,status) VALUES (1,1,'in_progress')");
  sqlite.run("INSERT INTO videos (id,duration_sec) VALUES (1,1000)");
  sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (1,1)");
  sqlite.run("INSERT INTO video_logs (id,user_id,video_id,status) VALUES (1,1,1,'submitted'),(2,2,1,'submitted')");
});

function claim(id: number, logId: number, itemId: number, ts: number, status = "proposed") {
  sqlite.run("INSERT INTO event_claims (id,log_id,catalog_item_id,timestamp_sec,status) VALUES (?,?,?,?,?)", [id, logId, itemId, ts, status]);
}

test("a membership fact both logs claim → agreed; one-log fact stays proposed", () => {
  claim(1, 1, 1, 100); // joke-a, log1
  claim(2, 2, 1, 150); // joke-a, log2  (shared)
  claim(3, 1, 2, 200); // joke-b, log1 only
  runMatching(db, 1);
  expect(statusOf(1)).toBe("agreed");
  expect(statusOf(2)).toBe("agreed");
  expect(statusOf(3)).toBe("proposed");
});

test("gym order: agreeing positions → agreed (even on different timestamp origins)", () => {
  [11, 12, 13].forEach((ci, i) => claim(100 + i, 1, ci, 10 + i));
  [11, 12, 13].forEach((ci, i) => claim(200 + i, 2, ci, 900 + i)); // different origin, same order
  runMatching(db, 1);
  for (const id of [100, 101, 102, 200, 201, 202]) expect(statusOf(id)).toBe("agreed");
});

test("gym order: a swap contests the swapped positions, leaves the rest agreed", () => {
  [11, 12, 13].forEach((ci, i) => claim(100 + i, 1, ci, 10 + i)); // g1,g2,g3
  [11, 13, 12].forEach((ci, i) => claim(200 + i, 2, ci, 900 + i)); // g1,g3,g2 (pos 2&3 swapped)
  runMatching(db, 1);
  expect(statusOf(100)).toBe("agreed"); // pos1 g1
  expect(statusOf(200)).toBe("agreed");
  expect(statusOf(101)).toBe("contested"); // pos2 differs
  expect(statusOf(201)).toBe("contested");
  expect(statusOf(102)).toBe("contested"); // pos3 differs
  expect(statusOf(202)).toBe("contested");
});

test("matching never overwrites a human verdict", () => {
  claim(1, 1, 1, 100, "certified");
  claim(2, 2, 1, 150, "proposed");
  runMatching(db, 1);
  expect(statusOf(1)).toBe("certified"); // left alone
  expect(statusOf(2)).toBe("proposed"); // its partner is human-ruled, so the fact is skipped
});

const detailField = () =>
  sqlite.run(
    "INSERT INTO category_fields (id,category_id,catalog_item_id,slug,label,type,required,sort_order) VALUES (1,1,NULL,'move','Move','text',0,0)",
  );

test("same item, disagreeing field value (e.g. the mimicked move) → contested", () => {
  detailField();
  claim(1, 1, 1, 100); // joke-a, log1
  claim(2, 2, 1, 150); // joke-a, log2 — same item, but...
  sqlite.run("INSERT INTO claim_fields (id,claim_id,field_id,value) VALUES (1,1,1,'tackle'),(2,2,1,'growl')");
  runMatching(db, 1);
  expect(statusOf(1)).toBe("contested");
  expect(statusOf(2)).toBe("contested");
});

test("same item, same field value → agreed", () => {
  detailField();
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150);
  sqlite.run("INSERT INTO claim_fields (id,claim_id,field_id,value) VALUES (1,1,1,'tackle'),(2,2,1,'tackle')");
  runMatching(db, 1);
  expect(statusOf(1)).toBe("agreed");
});

test("a resolved field conflict returns to agreed on the next match", () => {
  detailField();
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150);
  sqlite.run("INSERT INTO claim_fields (id,claim_id,field_id,value) VALUES (1,1,1,'tackle'),(2,2,1,'growl')");
  runMatching(db, 1);
  expect(statusOf(1)).toBe("contested");
  sqlite.run("UPDATE claim_fields SET value='tackle' WHERE claim_id = 2"); // a logger fixes it
  runMatching(db, 1);
  expect(statusOf(1)).toBe("agreed"); // contested isn't sticky — it re-derives
});

const recordState = () => (sqlite.query("SELECT record_state AS s FROM runs WHERE id = 1").get() as { s: string }).s;

test("run goes live when both slots submitted and every fact is agreed", () => {
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150); // joke-a both → agreed
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("live");
});

test("a one-sided (single-log) fact keeps the run reconciling", () => {
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150); // shared → agreed
  claim(3, 1, 2, 200); // joke-b, log1 only → stays proposed = a diff
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("reconciling");
});

test("only one slot submitted → still logging", () => {
  sqlite.run("UPDATE video_logs SET status='draft' WHERE id = 2");
  claim(1, 1, 1, 100);
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("logging");
});

test("an overturned fact is a settled verdict — it doesn't block go-live", () => {
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150); // joke-a both → agreed
  claim(3, 1, 2, 200, "overturned"); // joke-b struck — settled, not a diff
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("live");
});

test("escalated latches — a remaining diff keeps it with admin, not back to loggers", () => {
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150); // agreed
  claim(3, 1, 2, 200); // one-sided proposed = a diff
  runMatching(db, 1);
  sqlite.run("UPDATE runs SET record_state='escalated' WHERE id = 1");
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("escalated"); // not 'reconciling'
});

test("one round only: a diff surviving the reconcile round escalates (no second round)", () => {
  sqlite.run("UPDATE runs SET record_state='reconciling' WHERE id = 1"); // already had the blind round
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150); // agreed
  claim(3, 1, 2, 200); // still one-sided = unresolved
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("escalated");
});

test("reopening one log mid-reconcile preserves the round (doesn't reset to logging)", () => {
  sqlite.run("UPDATE runs SET record_state='reconciling' WHERE id = 1");
  sqlite.run("UPDATE video_logs SET status='draft' WHERE id = 2"); // a logger reopened to edit
  claim(1, 1, 1, 100);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("reconciling");
});

test("live latches — a post-live contest doesn't un-publish the run", () => {
  claim(1, 1, 1, 100);
  claim(2, 2, 1, 150);
  runMatching(db, 1);
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("live");
  sqlite.run("UPDATE event_claims SET status='contested' WHERE id IN (1,2)");
  recomputeRecordState(db, 1);
  expect(recordState()).toBe("live"); // stays published
});
