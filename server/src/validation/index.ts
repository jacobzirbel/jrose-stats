/**
 * Composition root for validation — the one place that knows BOTH core and
 * domain. Builds the neutral `ValidationContext` from the DB, instantiates the
 * generic + domain validators, runs them all, and collects violations.
 *
 * `GymCompletenessValidator` OWNS the Gyms category, so the generic
 * `RequiredCategoriesPresent` skips it (presence/cardinality deferred to it).
 */
import { sql } from "drizzle-orm";

import type { DB } from "../db/client";
import {
  CatalogItemActive,
  RequiredCategoriesPresent,
  TimestampBounds,
} from "./core-validators";
import { GymCompletenessValidator, LearnsetValidator } from "./domain-validators";
import type { ClaimValidator, ContextClaim, ValidationContext, Violation } from "./types";

export type { Violation } from "./types";

function buildContext(db: DB, logId: number): ValidationContext | null {
  // raw `db.get(sql)` returns a positional array in drizzle bun-sqlite — take [0] of all().
  const video = db.all<{ id: number; durationSec: number | null }>(sql`
    SELECT v.id AS id, v.duration_sec AS durationSec
    FROM video_logs vl JOIN videos v ON v.id = vl.video_id
    WHERE vl.id = ${logId}
  `)[0];
  if (!video) return null;

  const claims = db.all<ContextClaim>(sql`
    SELECT ec.id AS id, ec.catalog_item_id AS catalogItemId, ec.timestamp_sec AS timestampSec,
           ci.category_id AS categoryId, ci.label AS catalogItemLabel, ci.status AS catalogItemStatus,
           cat.slug AS categorySlug
    FROM event_claims ec
    JOIN catalog_items ci ON ci.id = ec.catalog_item_id
    JOIN categories cat ON cat.id = ci.category_id
    WHERE ec.log_id = ${logId}
  `);

  const categories = db
    .all<{ id: number; slug: string; label: string; required: number }>(
      sql`SELECT id, slug, label, required FROM categories`,
    )
    .map((c) => ({ id: c.id, slug: c.slug, label: c.label, required: c.required === 1 }));

  return { log: { id: logId }, video, claims, categories };
}

/** Run every validator over the log; empty array = clean (ready to submit). */
export function validateLog(db: DB, logId: number): Violation[] {
  const ctx = buildContext(db, logId);
  if (!ctx) return [{ code: "log-not-found", message: "Log not found." }];

  const validators: ClaimValidator[] = [
    new RequiredCategoriesPresent(new Set([GymCompletenessValidator.OWNS])),
    new TimestampBounds(),
    new CatalogItemActive(),
    new LearnsetValidator(db),
    new GymCompletenessValidator(db),
  ];

  return validators.flatMap((v) => v.validate(ctx));
}
