/**
 * Domain validators (Pokémon). They import core (`./types`) and the DB, never
 * the reverse. Each holds its own DB handle and does its own run/learnset/gym
 * lookups; core only hands over neutral `(claim, log, video)` facts.
 *
 * Run attribution: a claim's run is its `claim_run` row, or — in a single-run
 * video — that sole run. An unattributed Moves claim in a >1-run video is itself
 * an `ambiguous-run` violation (learnset can't be checked without a run).
 */
import { sql } from "drizzle-orm";

import type { DB } from "../db/client";
import type { ClaimValidator, ValidationContext, Violation } from "./types";

interface VideoRun {
  id: number;
  pokemonDex: number;
  status: string;
  name: string;
}

function videoRuns(db: DB, videoId: number): VideoRun[] {
  return db.all<VideoRun>(sql`
    SELECT r.id AS id, r.pokemon_dex AS pokemonDex, r.status AS status, p.name AS name
    FROM run_videos rv
    JOIN runs r ON r.id = rv.run_id
    JOIN pokemon p ON p.dex = r.pokemon_dex
    WHERE rv.video_id = ${videoId}
    ORDER BY r.pokemon_dex
  `);
}

function runIdForClaim(db: DB, claimId: number): number | null {
  // NOTE: drizzle bun-sqlite's raw `db.get(sql)` returns a positional ARRAY,
  // not a keyed object — use `db.all(...)[0]` for single-row raw SQL.
  const row = db.all<{ runId: number }>(
    sql`SELECT run_id AS runId FROM claim_run WHERE claim_id = ${claimId}`,
  )[0];
  return row?.runId ?? null;
}

/** A Moves claim's catalog item must resolve to a move in its run's learnset. */
export class LearnsetValidator implements ClaimValidator {
  constructor(private readonly db: DB) {}

  validate(ctx: ValidationContext): Violation[] {
    const moveClaims = ctx.claims.filter((c) => c.categorySlug === "moves");
    if (moveClaims.length === 0) return [];

    const runs = videoRuns(this.db, ctx.video.id);
    const multiRun = runs.length > 1;
    const out: Violation[] = [];

    for (const c of moveClaims) {
      let run: VideoRun | undefined;
      if (multiRun) {
        const runId = runIdForClaim(this.db, c.id);
        if (runId == null) {
          out.push({
            code: "ambiguous-run",
            message: `Move "${c.catalogItemLabel}" isn't attributed to a run (this video has multiple).`,
            claimId: c.id,
          });
          continue;
        }
        run = runs.find((r) => r.id === runId);
      } else {
        run = runs[0];
      }
      if (!run) continue; // no run on the video — nothing to check against

      const move = this.db.all<{ id: number }>(
        sql`SELECT id FROM moves WHERE catalog_item_id = ${c.catalogItemId}`,
      )[0];
      if (!move) continue; // not a move catalog item; LearnsetValidator ignores it

      const learns = this.db.all<{ one: number }>(sql`
        SELECT 1 AS one FROM pokemon_moves
        WHERE pokemon_dex = ${run.pokemonDex} AND move_id = ${move.id}
      `)[0];
      if (!learns) {
        out.push({
          code: "move-not-in-learnset",
          message: `${run.name} can't learn "${c.catalogItemLabel}".`,
          claimId: c.id,
        });
      }
    }
    return out;
  }
}

/**
 * Owns the Gyms category, PER RUN. For each run on the video: if `done`, all 8
 * distinct gyms must be present; duplicates are rejected; `impossible_abandoned`
 * waives the completeness check. Multi-run videos judge each run independently.
 */
export class GymCompletenessValidator implements ClaimValidator {
  static readonly OWNS = "gyms";
  static readonly REQUIRED_GYMS = 8;

  constructor(private readonly db: DB) {}

  validate(ctx: ValidationContext): Violation[] {
    const gymClaims = ctx.claims.filter((c) => c.categorySlug === GymCompletenessValidator.OWNS);
    const runs = videoRuns(this.db, ctx.video.id);
    const multiRun = runs.length > 1;
    const out: Violation[] = [];

    for (const run of runs) {
      const itemIds = gymClaims
        .filter((c) => !multiRun || runIdForClaim(this.db, c.id) === run.id)
        .map((c) => c.catalogItemId);
      const distinct = new Set(itemIds);

      if (itemIds.length > distinct.size) {
        out.push({ code: "gym-duplicate", message: `${run.name}: the same gym is logged twice.` });
      }
      if (run.status === "done" && distinct.size < GymCompletenessValidator.REQUIRED_GYMS) {
        out.push({
          code: "gyms-incomplete",
          message: `${run.name}: ${distinct.size}/${GymCompletenessValidator.REQUIRED_GYMS} gyms logged, but the run is marked done.`,
        });
      }
      // impossible_abandoned (and in_progress / untouched): completeness waived.
    }
    return out;
  }
}
