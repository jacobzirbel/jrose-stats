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
  ClaimFieldsValidator,
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

  const categoryFields = db
    .all<{
      id: number;
      categoryId: number;
      catalogItemId: number | null;
      slug: string;
      label: string;
      type: string;
      required: number;
    }>(sql`
      SELECT id, category_id AS categoryId, catalog_item_id AS catalogItemId,
             slug, label, type, required
      FROM category_fields
    `)
    .map((f) => ({ ...f, required: f.required === 1 }));

  const claimFields = db.all<{
    claimId: number;
    fieldId: number;
    value: string | null;
    valueCatalogItemId: number | null;
  }>(sql`
    SELECT cf.claim_id AS claimId, cf.field_id AS fieldId, cf.value AS value,
           cf.value_catalog_item_id AS valueCatalogItemId
    FROM claim_fields cf JOIN event_claims ec ON ec.id = cf.claim_id
    WHERE ec.log_id = ${logId}
  `);

  return { log: { id: logId }, video, claims, categories, categoryFields, claimFields };
}

/** Run every validator over the log; empty array = clean (ready to submit). */
export function validateLog(db: DB, logId: number): Violation[] {
  const ctx = buildContext(db, logId);
  if (!ctx) return [{ code: "log-not-found", message: "Log not found." }];

  const validators: ClaimValidator[] = [
    new RequiredCategoriesPresent(new Set([GymCompletenessValidator.OWNS])),
    new TimestampBounds(),
    new CatalogItemActive(),
    new ClaimFieldsValidator(),
    new LearnsetValidator(db),
    new GymCompletenessValidator(db),
  ];

  return validators.flatMap((v) => v.validate(ctx));
}
