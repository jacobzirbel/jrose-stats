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
 * Owns the Battles category, PER RUN, for gym completeness AND order. Gyms are
 * battle catalog items flagged in the domain `gyms` table (the merge keeps CORE
 * gym-blind). For each run on the video, unless it's `impossible_abandoned`
 * (the Magikarp-style case — can't beat the game, so completeness is waived):
 *   - all 8 distinct gyms must be present (no duplicates), and
 *   - they must respect Gen-1's forced bookends: sorted by timestamp, gym 1 is
 *     first, gym 2 second, gym 8 last. The middle five (Surge/Erika/Koga/
 *     Sabrina/Blaine, canonical_order 3–7) are route-dependent, so unconstrained.
 * Multi-run videos judge each run independently. (The submit gate — completeness
 * is enforced at submit, never deferred to the matcher, which is why M1/M2 die
 * here. Only `impossible_abandoned` opts out; `untouched`/`in_progress`/`done`
 * are all held to the full bar.)
 */
export class GymCompletenessValidator implements ClaimValidator {
  static readonly OWNS = "battles";
  static readonly REQUIRED_GYMS = 8;

  constructor(private readonly db: DB) {}

  validate(ctx: ValidationContext): Violation[] {
    // The gym battles among the combined Battles category — those bridged into
    // the domain `gyms` table (with their canonical 1–8 order). Non-gym battles
    // (rivals, Elite Four) are ignored.
    const orderByItem = new Map(
      this.db
        .all<{ id: number; ord: number }>(
          sql`SELECT catalog_item_id AS id, canonical_order AS ord FROM gyms`,
        )
        .map((r) => [r.id, r.ord] as const),
    );
    const gymClaims = ctx.claims.filter((c) => orderByItem.has(c.catalogItemId));
    const runs = videoRuns(this.db, ctx.video.id);
    const multiRun = runs.length > 1;
    const out: Violation[] = [];

    for (const run of runs) {
      if (run.status === "impossible_abandoned") continue; // completeness waived

      const claims = gymClaims.filter((c) => !multiRun || runIdForClaim(this.db, c.id) === run.id);
      const distinct = new Set(claims.map((c) => c.catalogItemId));

      if (claims.length > distinct.size) {
        out.push({ code: "gym-duplicate", message: `${run.name}: the same gym is logged twice.` });
        continue; // order is meaningless with a duplicate in the mix
      }
      if (distinct.size < GymCompletenessValidator.REQUIRED_GYMS) {
        out.push({
          code: "gyms-incomplete",
          message: `${run.name}: ${distinct.size}/${GymCompletenessValidator.REQUIRED_GYMS} gyms logged.`,
        });
        continue; // can't check order without the full set
      }

      // Forced bookends: by timestamp, gym 1 first, gym 2 second, gym 8 last.
      const ordered = [...claims].sort((a, b) => a.timestampSec - b.timestampSec);
      const ordOf = (c: (typeof ordered)[number]) => orderByItem.get(c.catalogItemId);
      if (ordOf(ordered[0]) !== 1 || ordOf(ordered[1]) !== 2 || ordOf(ordered[ordered.length - 1]) !== 8) {
        out.push({
          code: "gyms-misordered",
          message: `${run.name}: gyms 1 and 2 must be logged first and gym 8 last.`,
        });
      }
    }
    return out;
  }
}

/**
 * Every non-abandoned run on the video must have at least one Moves claim — a
 * solo run is defined by the moveset it uses, so an empty-of-moves log is never
 * complete. (Kept out of CORE's `RequiredCategoriesPresent` deliberately: "Moves
 * is a required category" would wrongly imply *every* move, and run-attribution
 * for multi-run videos is domain knowledge.) Waived for `impossible_abandoned`.
 */
export class MovesPresentValidator implements ClaimValidator {
  constructor(private readonly db: DB) {}

  validate(ctx: ValidationContext): Violation[] {
    const moveClaims = ctx.claims.filter((c) => c.categorySlug === "moves");
    const runs = videoRuns(this.db, ctx.video.id);
    const multiRun = runs.length > 1;
    const out: Violation[] = [];

    for (const run of runs) {
      if (run.status === "impossible_abandoned") continue;
      const hasMove = moveClaims.some((c) => !multiRun || runIdForClaim(this.db, c.id) === run.id);
      if (!hasMove) {
        out.push({ code: "no-moves", message: `${run.name}: log at least one move.` });
      }
    }
    return out;
  }
}

/**
 * Completeness for the NON-GYM battles. Gyms are required + ordered by
 * `GymCompletenessValidator`; this requires every OTHER battle (the rival fights,
 * both Giovanni fights, the Elite Four, the Champion) to be present per
 * non-abandoned run — EXCEPT the ones in `OPTIONAL_SLUGS`. `rival-1a` is an extra
 * rival fight that doesn't always happen, so it's the lone opt-out. Waived for
 * `impossible_abandoned`, like the gym + moves checks.
 *
 * (Optional-ness is a small hardcoded set here, matching `REQUIRED_GYMS = 8`. If
 * optional battles proliferate, promote it to a `catalog_items` flag.)
 */
export class BattlesPresentValidator implements ClaimValidator {
  static readonly OPTIONAL_SLUGS = new Set(["rival-1a"]);

  constructor(private readonly db: DB) {}

  validate(ctx: ValidationContext): Violation[] {
    const gymItemIds = new Set(
      this.db.all<{ id: number }>(sql`SELECT catalog_item_id AS id FROM gyms`).map((r) => r.id),
    );
    // Every active battle that is neither a gym nor explicitly optional.
    const required = this.db
      .all<{ id: number; slug: string; label: string }>(sql`
        SELECT ci.id AS id, ci.slug AS slug, ci.label AS label
        FROM catalog_items ci
        JOIN categories c ON c.id = ci.category_id
        WHERE c.slug = 'battles' AND ci.status = 'active'
      `)
      .filter((b) => !gymItemIds.has(b.id) && !BattlesPresentValidator.OPTIONAL_SLUGS.has(b.slug));

    const runs = videoRuns(this.db, ctx.video.id);
    const multiRun = runs.length > 1;
    const out: Violation[] = [];

    for (const run of runs) {
      if (run.status === "impossible_abandoned") continue;
      const present = new Set(
        ctx.claims
          .filter((c) => c.categorySlug === "battles" && (!multiRun || runIdForClaim(this.db, c.id) === run.id))
          .map((c) => c.catalogItemId),
      );
      const missing = required.filter((b) => !present.has(b.id));
      if (missing.length) {
        out.push({
          code: "battles-incomplete",
          message: `${run.name}: missing ${missing.map((b) => b.label).join(", ")}.`,
        });
      }
    }
    return out;
  }
}
