/**
 * Composition root for canonical derivation — the one place that knows BOTH the
 * generic transform (`./derive`) and the domain (gyms are ordinal). Mirrors the
 * validation layer's split: core stays Pokémon-blind, the domain wiring lives
 * here.
 *
 * Reads the claims attributed to a run (draft/retracted are dropped in derive).
 * Run attribution mirrors the workbench: a claim's run = claim_run.run_id, else
 * the sole run of the log's video.
 */
import { sql } from "drizzle-orm";

import type { DB } from "../db/client";
import { type CanonicalRun, type ClaimStatus, type DeriveClaim, type DeriveConfig, deriveCanonical } from "./derive";

export type { CanonicalRun } from "./derive";

/** Category slugs whose facts are ordinal (sequence-valued), not membership. */
const ORDINAL_CATEGORIES = new Set(["gyms"]);

const STATUSES = new Set<ClaimStatus>([
  "draft",
  "proposed",
  "agreed",
  "contested",
  "overturned",
  "certified",
  "retracted",
]);

interface ClaimRow {
  id: number;
  logId: number;
  videoId: number;
  userId: number;
  status: string;
  catalogItemId: number;
  categorySlug: string;
  label: string;
  timestampSec: number;
}

interface FieldRow {
  claimId: number;
  slug: string;
  label: string;
  value: string | null;
  valueCatalogItemId: number | null;
  valueLabel: string | null;
}

/**
 * Compute the canonical view for one run. Returns null if the run id doesn't
 * exist; an existing-but-empty run yields an all-zero CanonicalRun so the void
 * reads honestly.
 */
export function getCanonicalRun(db: DB, runId: number): CanonicalRun | null {
  const run = db.all<{ id: number; recordState: string }>(
    sql`SELECT id, record_state AS recordState FROM runs WHERE id = ${runId}`,
  )[0];
  if (!run) return null;

  // ids of the claims attributed to this run (from submitted, non-deleted logs);
  // reused by both queries so the run-attribution filter lives in one place.
  const runClaimIds = sql`
    SELECT ec.id
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    LEFT JOIN claim_run cr ON cr.claim_id = ec.id
    WHERE vl.deleted_at IS NULL
      AND COALESCE(
        cr.run_id,
        (SELECT rv.run_id FROM run_videos rv
          WHERE rv.video_id = vl.video_id
          GROUP BY rv.video_id HAVING COUNT(*) = 1)
      ) = ${runId}
  `;

  const claimRows = db.all<ClaimRow>(sql`
    SELECT ec.id AS id, ec.log_id AS logId, vl.video_id AS videoId, vl.user_id AS userId,
           ec.status AS status, ec.catalog_item_id AS catalogItemId, ec.timestamp_sec AS timestampSec,
           cat.slug AS categorySlug, ci.label AS label
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    JOIN catalog_items ci ON ci.id = ec.catalog_item_id
    JOIN categories cat ON cat.id = ci.category_id
    WHERE ec.id IN (${runClaimIds})
    ORDER BY ec.log_id, ec.timestamp_sec
  `);

  // The run's source videos — embedded on the record/diff screens; each
  // supporter carries its videoId so a jump button seeks the right one.
  const videos = db.all<{ id: number; youtubeId: string | null; title: string | null; durationSec: number | null }>(sql`
    SELECT v.id AS id, v.youtube_id AS youtubeId, v.title AS title, v.duration_sec AS durationSec
    FROM videos v
    JOIN run_videos rv ON rv.video_id = v.id
    WHERE rv.run_id = ${runId}
    ORDER BY rv.part_no, v.id
  `);

  const fieldRows = db.all<FieldRow>(sql`
    SELECT cf.claim_id AS claimId, f.slug AS slug, f.label AS label,
           cf.value AS value, cf.value_catalog_item_id AS valueCatalogItemId,
           ref.label AS valueLabel
    FROM claim_fields cf
    JOIN category_fields f ON f.id = cf.field_id
    LEFT JOIN catalog_items ref ON ref.id = cf.value_catalog_item_id
    WHERE cf.claim_id IN (${runClaimIds})
  `);

  const fieldsByClaim = new Map<number, FieldRow[]>();
  for (const f of fieldRows) (fieldsByClaim.get(f.claimId) ?? fieldsByClaim.set(f.claimId, []).get(f.claimId)!).push(f);

  const claims: DeriveClaim[] = claimRows.map((c) => ({
    id: c.id,
    logId: c.logId,
    videoId: c.videoId,
    userId: c.userId,
    status: (STATUSES.has(c.status as ClaimStatus) ? c.status : "proposed") as ClaimStatus,
    catalogItemId: c.catalogItemId,
    categorySlug: c.categorySlug,
    label: c.label,
    timestampSec: c.timestampSec,
    fields: (fieldsByClaim.get(c.id) ?? []).map((f) => ({
      slug: f.slug,
      label: f.label,
      value: f.value,
      valueCatalogItemId: f.valueCatalogItemId,
      valueLabel: f.valueLabel,
    })),
  }));

  const cfg: DeriveConfig = { ordinalCategories: ORDINAL_CATEGORIES };
  return deriveCanonical(runId, claims, cfg, run.recordState, videos);
}
