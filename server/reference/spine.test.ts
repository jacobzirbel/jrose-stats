/**
 * Spine read-queries (Phase 1D). Same in-memory harness as schema.test.ts so the
 * SQL runs against drizzle-kit's real migrated tables.
 */
import { beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { getPokemonDetail, getSpine } from "../src/db/queries/spine";

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./migrations" });

  // dex 0 = MissingNo (must be excluded from the 151 grid); 1..3 = spine.
  sqlite.run("INSERT INTO pokemon (dex,name) VALUES (0,'missingno'),(1,'bulbasaur'),(2,'ivysaur'),(3,'venusaur')");
  // dex 1: two runs (in_progress + done) -> grid shows 'done'. dex 2: untouched
  // via an explicit run. dex 3: no run row at all -> COALESCE 'untouched'.
  sqlite.run("INSERT INTO runs (id,pokemon_dex,attempt_no,status) VALUES (1,1,1,'in_progress'),(2,1,2,'done'),(3,2,1,'untouched')");
  // dex 1 has a video (playlist_pos 5); dex 2/3 have none.
  sqlite.run("INSERT INTO videos (id,title,youtube_id,playlist_pos) VALUES (10,'Bulba pt1','yt10',5)");
  sqlite.run("INSERT INTO run_videos (run_id,video_id,part_no) VALUES (2,10,1)");
});

test("getSpine excludes MissingNo and returns the spine mons", () => {
  const cells = getSpine(db);
  expect(cells.map((c) => c.dex)).toEqual([1, 2, 3]);
});

test("status is the most-progressed run; missing run defaults to untouched", () => {
  const byDex = new Map(getSpine(db).map((c) => [c.dex, c]));
  expect(byDex.get(1)!.status).toBe("done"); // done beats in_progress
  expect(byDex.get(2)!.status).toBe("untouched");
  expect(byDex.get(3)!.status).toBe("untouched"); // no run row
});

test("videoCount reflects run_videos links", () => {
  const byDex = new Map(getSpine(db).map((c) => [c.dex, c]));
  expect(byDex.get(1)!.videoCount).toBe(1);
  expect(byDex.get(2)!.videoCount).toBe(0);
});

test("playlist sort puts video-less mons last", () => {
  const cells = getSpine(db, "playlist");
  expect(cells.map((c) => c.dex)).toEqual([1, 2, 3]); // 1 has playlist_pos 5; 2,3 null -> after, tie-broken by dex
  expect(cells[0]!.playlistPos).toBe(5);
  expect(cells[1]!.playlistPos).toBeNull();
});

test("getPokemonDetail returns the mon + its linked videos", () => {
  const d = getPokemonDetail(db, 1);
  expect(d).not.toBeNull();
  expect(d!.name).toBe("bulbasaur");
  expect(d!.status).toBe("done");
  expect(d!.videos).toHaveLength(1);
  expect(d!.videos[0]!.youtubeId).toBe("yt10");
});

test("getPokemonDetail is null for MissingNo and out-of-range dex", () => {
  expect(getPokemonDetail(db, 0)).toBeNull();
  expect(getPokemonDetail(db, 999)).toBeNull();
});
