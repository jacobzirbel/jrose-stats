/**
 * Submit-gate validators (Phase 1E). Same in-memory harness as schema.test.ts:
 * migrate the real tables, seed a small world, run `validateLog`, assert which
 * violation codes fire. Covers the generic (timestamp, required) + domain
 * (learnset, gym completeness, ambiguous-run) rules from schema.md › Validation.
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { validateLog } from "../src/validation";

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const codes = (logId = 1) => validateLog(db, logId).map((v) => v.code);

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./migrations" });

  sqlite.run("INSERT INTO users (id,username,email,password_hash) VALUES (1,'u','e','h')");
  // categories: moves (optional), gyms (required, domain-owned)
  sqlite.run("INSERT INTO categories (id,slug,label,required) VALUES (1,'moves','Moves',0),(2,'gyms','Gyms',1)");
  // catalog items: 1=tackle (learnable), 2=hydro-pump (not), 3..10 = the 8 gyms
  sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (1,1,'tackle','Tackle','active'),(2,1,'hydro-pump','Hydro Pump','active')");
  for (let g = 1; g <= 8; g++) {
    sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (?,2,?,?,'active')", [2 + g, `gym${g}`, `Gym ${g}`]);
    sqlite.run("INSERT INTO gyms (id,catalog_item_id,leader,city,canonical_order) VALUES (?,?,?,?,?)", [g, 2 + g, `L${g}`, `C${g}`, g]);
  }
  // moves bridge + learnset: Bulbasaur learns tackle, NOT hydro-pump
  sqlite.run("INSERT INTO moves (id,catalog_item_id,name) VALUES (33,1,'tackle'),(56,2,'hydro-pump')");
  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (1,'Bulbasaur')");
  sqlite.run("INSERT INTO pokemon_moves (pokemon_dex,move_id) VALUES (1,33)");
  // video (100s) + a single in-progress run + the draft log
  sqlite.run("INSERT INTO videos (id,duration_sec) VALUES (1,100)");
  sqlite.run("INSERT INTO runs (id,pokemon_dex,status) VALUES (1,1,'in_progress')");
  sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (1,1)");
  sqlite.run("INSERT INTO video_logs (id,user_id,video_id) VALUES (1,1,1)");
});

function claim(id: number, catalogItemId: number, ts: number) {
  sqlite.run("INSERT INTO event_claims (id,log_id,catalog_item_id,timestamp_sec) VALUES (?,1,?,?)", [id, catalogItemId, ts]);
}
const setRunDone = () => sqlite.run("UPDATE runs SET status='done' WHERE id=1");
const allGyms = () => [3, 4, 5, 6, 7, 8, 9, 10].forEach((ci, i) => claim(100 + i, ci, 10 + i));

test("empty log on an in-progress run is clean (gyms waived, no required-non-owned cat)", () => {
  expect(codes()).toEqual([]);
});

test("timestamp past the video duration → timestamp-out-of-bounds", () => {
  claim(1, 1, 200); // tackle at 200s, video is 100s
  expect(codes()).toContain("timestamp-out-of-bounds");
});

test("a move outside the learnset → move-not-in-learnset", () => {
  claim(1, 2, 10); // hydro-pump
  expect(codes()).toContain("move-not-in-learnset");
});

test("a learnable move is accepted", () => {
  claim(1, 1, 10); // tackle
  expect(codes()).not.toContain("move-not-in-learnset");
});

test("run done with <8 gyms → gyms-incomplete", () => {
  setRunDone();
  claim(1, 3, 10);
  claim(2, 4, 20);
  expect(codes()).toContain("gyms-incomplete");
});

test("run done with all 8 distinct gyms is clean", () => {
  setRunDone();
  allGyms();
  expect(codes()).toEqual([]);
});

test("the same gym twice → gym-duplicate", () => {
  claim(1, 3, 10);
  claim(2, 3, 20);
  expect(codes()).toContain("gym-duplicate");
});

test("required non-owned category missing → required-category-missing", () => {
  sqlite.run("INSERT INTO categories (id,slug,label,required) VALUES (3,'deaths','Deaths',1)");
  expect(codes()).toContain("required-category-missing");
});

test("unattributed move in a multi-run video → ambiguous-run", () => {
  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (2,'Ivysaur')");
  sqlite.run("INSERT INTO runs (id,pokemon_dex,status) VALUES (2,2,'in_progress')");
  sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (2,1)"); // now 2 runs host video 1
  claim(1, 1, 10); // tackle, no claim_run row
  expect(codes()).toContain("ambiguous-run");
});
