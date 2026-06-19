/**
 * Canonical view (Phase 1 read side). Same in-memory harness as the other
 * reference tests: migrate the real tables, seed a small world, insert claims
 * with explicit lifecycle statuses, and assert the derived facts/standings.
 *
 * Covers: membership standings from status, the certified>agreed headline rule,
 * draft/retracted filtering, field-value collapse, and the ordinal edge case the
 * model exists for — two logs that AGREE on gym order despite timestamps on
 * different origins must still resolve cleanly (per-log own-clock ordering).
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { getCanonicalRun } from "../src/canonical";
import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const view = () => getCanonicalRun(db, 1)!;

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./migrations" });

  sqlite.run("INSERT INTO users (id,username,email,password_hash) VALUES (1,'a','a','h'),(2,'b','b','h')");
  // events (membership) + gyms (ordinal)
  sqlite.run("INSERT INTO categories (id,slug,label) VALUES (1,'events','Events'),(2,'gyms','Gyms')");
  // events: 1=joke-a, 2=joke-b ; gyms: 11..14
  sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (1,1,'joke-a','Joke A','active'),(2,1,'joke-b','Joke B','active')");
  for (let g = 1; g <= 4; g++) {
    sqlite.run("INSERT INTO catalog_items (id,category_id,slug,label,status) VALUES (?,2,?,?,'active')", [10 + g, `gym${g}`, `Gym ${g}`]);
  }
  // a text field on joke-a, for the field-collapse test
  sqlite.run("INSERT INTO category_fields (id,category_id,catalog_item_id,slug,label,type,required,sort_order) VALUES (1,1,1,'detail','Detail','text',0,0)");

  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (1,'Bulbasaur')");
  sqlite.run("INSERT INTO runs (id,pokemon_dex,status) VALUES (1,1,'in_progress')");
  sqlite.run("INSERT INTO videos (id,duration_sec) VALUES (1,1000)");
  sqlite.run("INSERT INTO run_videos (run_id,video_id) VALUES (1,1)"); // single run => implied attribution
  sqlite.run("INSERT INTO video_logs (id,user_id,video_id,status) VALUES (1,1,1,'submitted'),(2,2,1,'submitted')");
});

function claim(id: number, logId: number, itemId: number, ts: number, status: string) {
  sqlite.run("INSERT INTO event_claims (id,log_id,catalog_item_id,timestamp_sec,status) VALUES (?,?,?,?,?)", [id, logId, itemId, ts, status]);
}
const item = (dex = 1) => view().membership.find((m) => m.catalogItemId === dex)!;

test("unknown run id → null", () => {
  expect(getCanonicalRun(db, 999)).toBeNull();
});

test("a lone proposed claim → the fact is pending, support 1", () => {
  claim(1, 1, 1, 100, "proposed");
  const m = item(1);
  expect(m.standing).toBe("pending");
  expect(m.support).toBe(1);
  expect(view().summary).toMatchObject({ canonical: 0, pending: 1 });
});

test("two independent logs agreeing → canonical, support 2", () => {
  claim(1, 1, 1, 100, "agreed");
  claim(2, 2, 1, 150, "agreed");
  const m = item(1);
  expect(m.standing).toBe("canonical");
  expect(m.support).toBe(2);
  expect(view().summary.canonical).toBe(1);
});

test("contested and overturned surface as their own standings", () => {
  claim(1, 1, 1, 100, "contested");
  claim(2, 1, 2, 100, "overturned");
  expect(item(1).standing).toBe("contested");
  expect(item(2).standing).toBe("overturned");
  expect(view().summary).toMatchObject({ contested: 1, overturned: 1 });
});

test("a fact whose claims disagree on status is flagged divergent (data-integrity guard)", () => {
  // shouldn't happen in practice — claims on a fact move together — but if it does
  // we surface it rather than silently rank a winner.
  claim(1, 1, 1, 100, "agreed");
  claim(2, 2, 1, 150, "certified");
  expect(item(1).divergent).toBe(true);
  expect(view().summary.divergent).toBe(1);
});

test("a fact whose claims share a status is not divergent", () => {
  claim(1, 1, 1, 100, "agreed");
  claim(2, 2, 1, 150, "agreed");
  expect(item(1).divergent).toBe(false);
  expect(view().summary.divergent).toBe(0);
});

test("draft and retracted claims are filtered out entirely", () => {
  claim(1, 1, 1, 100, "draft");
  claim(2, 1, 2, 100, "retracted");
  expect(view().membership).toHaveLength(0);
  expect(view().summary).toMatchObject({ canonical: 0, pending: 0, contested: 0, overturned: 0 });
});

test("agreeing field values collapse to one value backed by both logs", () => {
  claim(1, 1, 1, 100, "agreed");
  claim(2, 2, 1, 150, "agreed");
  sqlite.run("INSERT INTO claim_fields (id,claim_id,field_id,value) VALUES (1,1,1,'foo'),(2,2,1,'foo')");
  const f = item(1).fields;
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ slug: "detail", value: "foo" });
  expect(f[0].logIds.sort()).toEqual([1, 2]);
});

test("disagreeing field values stay as separate candidates", () => {
  claim(1, 1, 1, 100, "agreed");
  claim(2, 2, 1, 150, "agreed");
  sqlite.run("INSERT INTO claim_fields (id,claim_id,field_id,value) VALUES (1,1,1,'foo'),(2,2,1,'bar')");
  expect(item(1).fields).toHaveLength(2);
});

test("gym order: same sequence on different timestamp origins resolves clean", () => {
  // log1 times from video start (minute 0), log2 from run start (minute 8) — same order
  [11, 12, 13, 14].forEach((ci, i) => claim(100 + i, 1, ci, 10 + i, "agreed"));
  [11, 12, 13, 14].forEach((ci, i) => claim(200 + i, 2, ci, 500 + i, "agreed"));
  const order = view().order;
  expect(order).toHaveLength(4);
  for (const o of order) {
    expect(o.candidates).toHaveLength(1); // both logs agree on this position
    expect(o.support).toBe(2);
    expect(o.standing).toBe("canonical");
  }
  expect(order.map((o) => o.candidates[0].catalogItemId)).toEqual([11, 12, 13, 14]);
});

test("gym order: an adjacent swap contests only the two swapped positions", () => {
  [11, 12, 13, 14].forEach((ci, i) => claim(100 + i, 1, ci, 10 + i, "agreed"));
  // log2 swaps positions 2 and 3 (gym2 <-> gym3)
  [11, 13, 12, 14].forEach((ci, i) => claim(200 + i, 2, ci, 500 + i, "agreed"));
  const byPos = (p: number) => view().order.find((o) => o.position === p)!;
  expect(byPos(1).candidates).toHaveLength(1);
  expect(byPos(2).candidates).toHaveLength(2);
  expect(byPos(3).candidates).toHaveLength(2);
  expect(byPos(4).candidates).toHaveLength(1);
});

test("an accepted proposal folds into the record as a certified fact; pending ones are listed", () => {
  // accepted proposal for joke-a (id 1), pending proposal for joke-b (id 2)
  sqlite.run(
    "INSERT INTO proposals (id,run_id,video_id,catalog_item_id,timestamp_sec,proposed_by,status) VALUES (1,1,1,1,300,1,'accepted'),(2,1,1,2,400,2,'pending')",
  );
  const v = view();
  const accepted = v.membership.find((m) => m.catalogItemId === 1)!;
  expect(accepted.status).toBe("certified"); // folded in as canonical
  expect(accepted.standing).toBe("canonical");
  // the pending one is listed separately, not yet a fact
  expect(v.proposals.map((p) => p.catalogItemId)).toEqual([2]);
  expect(v.membership.find((m) => m.catalogItemId === 2)).toBeUndefined();
});
