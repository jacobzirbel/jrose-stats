/**
 * DOMAIN schema — the Pokémon layer.
 *
 * Translated from gobrain `schema.md` › "DDL — DOMAIN". Only the validation
 * layer touches these tables. Imports from ./core for cross-FKs; every
 * cross-table FK points domain -> core (never the reverse).
 *
 * Runs model (session 9): `runs` is the domain spine unit, decoupled from
 * videos so the mapping is many-to-many — a video may host >1 run (the 2-mon
 * video), a run may span >1 video (multi-part). Core stays untouched.
 */
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { catalogItems, eventClaims, videoLogs, videos } from "./core";

export const pokemon = sqliteTable("pokemon", {
  dex: integer("dex").primaryKey(), // 0=MissingNo, 1..151 (explicit, not autoinc)
  name: text("name").notNull(),
  isGlitch: integer("is_glitch").notNull().default(0),
  type1: text("type1"),
  type2: text("type2"),
});

export const runs = sqliteTable(
  "runs", // one Pokémon's solo attempt = the domain spine unit
  {
    id: integer("id").primaryKey(),
    pokemonDex: integer("pokemon_dex")
      .notNull()
      .references(() => pokemon.dex),
    attemptNo: integer("attempt_no").notNull().default(1), // supports re-attempts
    status: text("status").notNull().default("untouched"),
  },
  (t) => [
    unique("runs_pokemon_attempt_uq").on(t.pokemonDex, t.attemptNo),
    check(
      "runs_status_chk",
      sql`${t.status} IN ('untouched','in_progress','done','impossible_abandoned')`,
    ),
  ],
);

export const runVideos = sqliteTable(
  "run_videos", // MANY-TO-MANY junction (video hosts >=1 run; run spans >=1 video)
  {
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id), // domain -> core
    partNo: integer("part_no").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.runId, t.videoId] })],
);

export const claimRun = sqliteTable("claim_run", {
  // DOMAIN annotation attributing a core claim to a run. PK on claim_id =>
  // at most one run per claim. Populated only when a video hosts >1 run.
  claimId: integer("claim_id")
    .primaryKey()
    .references(() => eventClaims.id, { onDelete: "cascade" }), // domain -> core
  runId: integer("run_id")
    .notNull()
    .references(() => runs.id),
});

export const moves = sqliteTable("moves", {
  id: integer("id").primaryKey(), // PokéAPI id = domain identity
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .unique()
    .references(() => catalogItems.id), // bridge -> core
  name: text("name").notNull().unique(),
  category: text("category"), // physical/special/status (PokéAPI damage_class)
});

export const gyms = sqliteTable("gyms", {
  id: integer("id").primaryKey(),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .unique()
    .references(() => catalogItems.id), // bridge -> core
  leader: text("leader").notNull(),
  city: text("city").notNull(),
  canonicalOrder: integer("canonical_order").notNull().unique(), // 1..8 reference order
});

export const pokemonMoves = sqliteTable(
  "pokemon_moves", // learnset junction
  {
    pokemonDex: integer("pokemon_dex")
      .notNull()
      .references(() => pokemon.dex),
    moveId: integer("move_id")
      .notNull()
      .references(() => moves.id),
  },
  (t) => [primaryKey({ columns: [t.pokemonDex, t.moveId] })],
);

export const runStats = sqliteTable(
  "run_stats", // per (log, run): a 2-run log carries one row per run
  {
    logId: integer("log_id")
      .notNull()
      .references(() => videoLogs.id, { onDelete: "cascade" }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    jroseTier: text("jrose_tier"),
    tierPosition: integer("tier_position"),
    finalLevel: integer("final_level"),
    completionSec: real("completion_sec"),
  },
  (t) => [primaryKey({ columns: [t.logId, t.runId] })],
);
