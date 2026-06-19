/**
 * Workbench API (Phase 1E): the logging surface. All write routes require auth
 * and verify the target log belongs to the caller. Reads of the catalog are
 * open (the vocabulary isn't secret); the draft + claims are per-user.
 *
 *   GET  /api/catalog                 categories + their active items
 *   POST /api/logs/:videoId/open      ensure a draft log, return the bootstrap
 *   POST /api/logs/:logId/claims      drop a timestamped claim (optionally run-attributed)
 *   DELETE /api/claims/:claimId       remove a waypoint
 */
import { Hono } from "hono";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { type AppEnv, requireAuth } from "../auth/middleware";
import { db } from "../db/client";
import {
  catalogItems,
  categories,
  categoryFields,
  claimFields,
  claimRun,
  eventClaims,
  videoLogs,
  videos,
} from "../db/schema";
import { validateLog } from "../validation";
import { recomputeRecordState, runMatching } from "../canonical/match";

export const workbenchRoutes = new Hono<AppEnv>();

// --- catalog (the tagging vocabulary) --------------------------------------
workbenchRoutes.get("/catalog", (c) => {
  const cats = db
    .select({
      id: categories.id,
      slug: categories.slug,
      label: categories.label,
      keybind: categories.keybind,
      required: categories.required,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all();

  const items = db
    .select({
      id: catalogItems.id,
      categoryId: catalogItems.categoryId,
      slug: catalogItems.slug,
      label: catalogItems.label,
    })
    .from(catalogItems)
    .where(sql`${catalogItems.status} <> 'retired'`)
    .orderBy(asc(catalogItems.label))
    .all();

  const byCategory = new Map<number, typeof items>();
  for (const it of items) {
    (byCategory.get(it.categoryId) ?? byCategory.set(it.categoryId, []).get(it.categoryId)!).push(it);
  }

  // Per-claim metadata field config. ref_category resolves to a slug so the
  // client can drive a catalog_ref picker off the category list it already has
  // (a CORE pointer — no domain/learnset knowledge in the generic field UI).
  const refCat = alias(categories, "ref_cat");
  const fields = db
    .select({
      id: categoryFields.id,
      categoryId: categoryFields.categoryId,
      catalogItemId: categoryFields.catalogItemId,
      slug: categoryFields.slug,
      label: categoryFields.label,
      type: categoryFields.type,
      refCategorySlug: refCat.slug,
      options: categoryFields.options,
      required: categoryFields.required,
      sortOrder: categoryFields.sortOrder,
    })
    .from(categoryFields)
    .leftJoin(refCat, eq(refCat.id, categoryFields.refCategoryId))
    .orderBy(asc(categoryFields.sortOrder), asc(categoryFields.id))
    .all();

  return c.json({
    categories: cats.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      label: cat.label,
      keybind: cat.keybind,
      required: cat.required === 1,
      items: (byCategory.get(cat.id) ?? []).map(({ id, slug, label }) => ({ id, slug, label })),
    })),
    fields: fields.map((f) => ({
      ...f,
      required: f.required === 1,
      options: f.options ? (JSON.parse(f.options) as { value: string; label: string }[]) : null,
    })),
  });
});

// --- open / ensure the caller's draft for a video --------------------------
workbenchRoutes.post("/logs/:videoId/open", requireAuth, (c) => {
  const user = c.get("user")!;
  const videoId = Number(c.req.param("videoId"));
  if (!Number.isInteger(videoId)) return c.json({ error: "Bad video id" }, 400);

  const video = db
    .select({
      id: videos.id,
      title: videos.title,
      youtubeId: videos.youtubeId,
      durationSec: videos.durationSec,
    })
    .from(videos)
    .where(eq(videos.id, videoId))
    .get();
  if (!video) return c.json({ error: "Video not found" }, 404);

  // One live log per (user, video). If the caller has none, claim a free slot
  // (each video has exactly two; first-come). No slot → the pair is full.
  let log = db
    .select({ id: videoLogs.id, status: videoLogs.status, slot: videoLogs.slot })
    .from(videoLogs)
    .where(
      and(eq(videoLogs.userId, user.id), eq(videoLogs.videoId, videoId), isNull(videoLogs.deletedAt)),
    )
    .get();
  if (!log) {
    const taken = db
      .all<{ slot: number | null }>(
        sql`SELECT slot FROM video_logs WHERE video_id = ${videoId} AND deleted_at IS NULL`,
      )
      .map((r) => r.slot);
    const slot = [1, 2].find((s) => !taken.includes(s));
    if (slot == null) return c.json({ error: "Both logger slots for this video are taken." }, 409);
    log = db
      .insert(videoLogs)
      .values({ userId: user.id, videoId, slot })
      .returning({ id: videoLogs.id, status: videoLogs.status, slot: videoLogs.slot })
      .get();
  }

  // Runs hosted by this video (>1 => the which-run control is needed).
  const runs = db.all<{
    id: number;
    pokemonDex: number;
    name: string;
    status: string;
    partNo: number;
  }>(sql`
    SELECT r.id AS id, r.pokemon_dex AS pokemonDex, p.name AS name,
           r.status AS status, rv.part_no AS partNo
    FROM run_videos rv
    JOIN runs r ON r.id = rv.run_id
    JOIN pokemon p ON p.dex = r.pokemon_dex
    WHERE rv.video_id = ${videoId}
    ORDER BY r.pokemon_dex
  `);

  const claimRows = db.all<{
    id: number;
    catalogItemId: number;
    timestampSec: number;
    note: string | null;
    runId: number | null;
  }>(sql`
    SELECT ec.id AS id, ec.catalog_item_id AS catalogItemId, ec.timestamp_sec AS timestampSec,
           ec.note AS note, cr.run_id AS runId
    FROM event_claims ec
    LEFT JOIN claim_run cr ON cr.claim_id = ec.id
    WHERE ec.log_id = ${log.id}
    ORDER BY ec.timestamp_sec
  `);

  // Saved metadata values, grouped onto their claim (drives the field UI on reopen).
  const values = db.all<{
    claimId: number;
    fieldId: number;
    value: string | null;
    valueCatalogItemId: number | null;
  }>(sql`
    SELECT cf.claim_id AS claimId, cf.field_id AS fieldId, cf.value AS value,
           cf.value_catalog_item_id AS valueCatalogItemId
    FROM claim_fields cf JOIN event_claims ec ON ec.id = cf.claim_id
    WHERE ec.log_id = ${log.id}
  `);
  const fieldsByClaim = new Map<number, { fieldId: number; value: string | null; valueCatalogItemId: number | null }[]>();
  for (const v of values) {
    const { claimId, ...rest } = v;
    (fieldsByClaim.get(claimId) ?? fieldsByClaim.set(claimId, []).get(claimId)!).push(rest);
  }
  const claims = claimRows.map((cl) => ({ ...cl, fields: fieldsByClaim.get(cl.id) ?? [] }));

  return c.json({ log, video, runs, claims });
});

// --- drop a claim (a waypoint) ---------------------------------------------
workbenchRoutes.post("/logs/:logId/claims", requireAuth, async (c) => {
  const user = c.get("user")!;
  const logId = Number(c.req.param("logId"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const catalogItemId = Number(body.catalogItemId);
  const timestampSec = Number(body.timestampSec);
  const note = body.note != null ? String(body.note) : null;
  const runId = body.runId != null ? Number(body.runId) : null;

  if (!Number.isInteger(catalogItemId) || !Number.isFinite(timestampSec) || timestampSec < 0) {
    return c.json({ error: "catalogItemId and a non-negative timestampSec are required." }, 400);
  }

  const log = ownedDraft(user.id, logId);
  if (!log) return c.json({ error: "Log not found" }, 404);

  const claim = db
    .insert(eventClaims)
    .values({ logId, catalogItemId, timestampSec, note })
    .returning({ id: eventClaims.id })
    .get();

  if (runId != null) {
    db.insert(claimRun).values({ claimId: claim.id, runId }).run();
  }
  touchLog(logId);

  return c.json({ id: claim.id, catalogItemId, timestampSec, note, runId }, 201);
});

// --- set a claim's metadata field values (replace-all) ---------------------
workbenchRoutes.put("/claims/:claimId/fields", requireAuth, async (c) => {
  const user = c.get("user")!;
  const claimId = Number(c.req.param("claimId"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const incoming = Array.isArray(body.values) ? (body.values as Record<string, unknown>[]) : [];

  // The claim must sit on the caller's DRAFT log; pull its category + item for scoping.
  const claim = db.all<{ id: number; logId: number; categoryId: number; catalogItemId: number }>(sql`
    SELECT ec.id AS id, ec.log_id AS logId, ci.category_id AS categoryId, ec.catalog_item_id AS catalogItemId
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    JOIN catalog_items ci ON ci.id = ec.catalog_item_id
    WHERE ec.id = ${claimId} AND vl.user_id = ${user.id} AND vl.status = 'draft' AND vl.deleted_at IS NULL
  `)[0];
  if (!claim) return c.json({ error: "Claim not found" }, 404);

  // Fields valid for this claim's scope (category-wide OR this exact item).
  const applicable = db.all<{ id: number; type: string; required: number }>(sql`
    SELECT id, type, required FROM category_fields
    WHERE category_id = ${claim.categoryId}
      AND (catalog_item_id IS NULL OR catalog_item_id = ${claim.catalogItemId})
  `);
  const byId = new Map(applicable.map((f) => [f.id, f]));

  const rows: { claimId: number; fieldId: number; value: string | null; valueCatalogItemId: number | null }[] = [];
  for (const v of incoming) {
    const field = byId.get(Number(v.fieldId));
    if (!field) return c.json({ error: `Field ${v.fieldId} doesn't apply to this claim.` }, 400);

    if (field.type === "catalog_ref") {
      const refId = v.valueCatalogItemId != null ? Number(v.valueCatalogItemId) : NaN;
      if (!Number.isInteger(refId)) return c.json({ error: `"${field.id}" needs a catalog selection.` }, 400);
      rows.push({ claimId, fieldId: field.id, value: null, valueCatalogItemId: refId });
    } else {
      const value = v.value != null ? String(v.value).trim() : "";
      if (!value) continue; // empty scalar = "leave unset", not an error
      if ((field.type === "number" || field.type === "duration") && !Number.isFinite(Number(value))) {
        return c.json({ error: `"${field.id}" must be numeric.` }, 400);
      }
      rows.push({ claimId, fieldId: field.id, value, valueCatalogItemId: null });
    }
  }

  // Replace-all: clear this claim's values, write the new set atomically.
  db.transaction((tx) => {
    tx.delete(claimFields).where(eq(claimFields.claimId, claimId)).run();
    if (rows.length) tx.insert(claimFields).values(rows).run();
  });
  touchLog(claim.logId);

  return c.json({
    claimId,
    fields: rows.map(({ fieldId, value, valueCatalogItemId }) => ({ fieldId, value, valueCatalogItemId })),
  });
});

// --- submit (draft -> submitted) through the validator gate ----------------
workbenchRoutes.post("/logs/:logId/submit", requireAuth, (c) => {
  const user = c.get("user")!;
  const logId = Number(c.req.param("logId"));

  const log = ownedDraft(user.id, logId);
  if (!log) return c.json({ error: "Log not found" }, 404);

  const violations = validateLog(db, logId);
  if (violations.length > 0) return c.json({ ok: false, violations }, 422);

  db.update(videoLogs)
    .set({ status: "submitted", submittedAt: sql`datetime('now')`, updatedAt: sql`datetime('now')` })
    .where(eq(videoLogs.id, logId))
    .run();

  // The log's claims leave draft and go on the record as `proposed`.
  db.update(eventClaims)
    .set({ status: "proposed" })
    .where(and(eq(eventClaims.logId, logId), eq(eventClaims.status, "draft")))
    .run();

  // Run matching for every run this video hosts — if a blind partner has already
  // submitted, shared assertions flip to `agreed` (ordinal disagreements contest).
  const runIds = db.all<{ runId: number }>(sql`
    SELECT rv.run_id AS runId FROM run_videos rv
    JOIN video_logs vl ON vl.video_id = rv.video_id
    WHERE vl.id = ${logId}
  `);
  for (const { runId } of runIds) {
    runMatching(db, runId);
    recomputeRecordState(db, runId);
  }

  return c.json({ ok: true, status: "submitted" });
});

// --- reopen a submitted log for reconciliation edits (submitted -> draft) ---
workbenchRoutes.post("/logs/:logId/reopen", requireAuth, (c) => {
  const user = c.get("user")!;
  const logId = Number(c.req.param("logId"));

  const log = db.all<{ id: number }>(sql`
    SELECT id FROM video_logs
    WHERE id = ${logId} AND user_id = ${user.id} AND status = 'submitted' AND deleted_at IS NULL
  `)[0];
  if (!log) return c.json({ error: "Log not found" }, 404);

  // A published run latches live; don't let a reopen desync it.
  const live = db.all<{ one: number }>(sql`
    SELECT 1 AS one FROM runs r
    JOIN run_videos rv ON rv.run_id = r.id
    JOIN video_logs vl ON vl.video_id = rv.video_id
    WHERE vl.id = ${logId} AND r.record_state = 'live' LIMIT 1
  `)[0];
  if (live) return c.json({ error: "This run is already live." }, 409);

  // Back to draft so the normal edit endpoints accept it. Claim statuses are
  // left as-is (matching re-derives them on resubmit). With one log no longer
  // submitted the run drops out of reconciling until it's resubmitted.
  db.update(videoLogs)
    .set({ status: "draft", updatedAt: sql`datetime('now')` })
    .where(eq(videoLogs.id, logId))
    .run();

  const runIds = db.all<{ runId: number }>(sql`
    SELECT rv.run_id AS runId FROM run_videos rv
    JOIN video_logs vl ON vl.video_id = rv.video_id WHERE vl.id = ${logId}
  `);
  for (const { runId } of runIds) recomputeRecordState(db, runId);

  return c.json({ ok: true, status: "draft" });
});

// --- re-timestamp a claim (fixes order; owner's draft only) -----------------
workbenchRoutes.put("/claims/:claimId/timestamp", requireAuth, async (c) => {
  const user = c.get("user")!;
  const claimId = Number(c.req.param("claimId"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const timestampSec = Number(body.timestampSec);
  if (!Number.isInteger(claimId) || !Number.isFinite(timestampSec) || timestampSec < 0) {
    return c.json({ error: "A non-negative timestampSec is required." }, 400);
  }

  const claim = db.all<{ id: number; logId: number }>(sql`
    SELECT ec.id AS id, ec.log_id AS logId
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    WHERE ec.id = ${claimId} AND vl.user_id = ${user.id} AND vl.status = 'draft' AND vl.deleted_at IS NULL
  `)[0];
  if (!claim) return c.json({ error: "Claim not found" }, 404);

  db.update(eventClaims).set({ timestampSec }).where(eq(eventClaims.id, claimId)).run();
  touchLog(claim.logId);
  return c.json({ id: claimId, timestampSec });
});

// --- delete a claim ---------------------------------------------------------
workbenchRoutes.delete("/claims/:claimId", requireAuth, (c) => {
  const user = c.get("user")!;
  const claimId = Number(c.req.param("claimId"));

  // Only the owner of the claim's log may delete it.
  // (raw `db.get(sql)` returns a positional array in drizzle bun-sqlite — use all()[0].)
  const owned = db.all<{ id: number }>(sql`
    SELECT ec.id AS id
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    WHERE ec.id = ${claimId} AND vl.user_id = ${user.id} AND vl.deleted_at IS NULL
  `)[0];
  if (!owned) return c.json({ error: "Claim not found" }, 404);

  db.delete(eventClaims).where(eq(eventClaims.id, claimId)).run(); // claim_run cascades
  return c.body(null, 204);
});

/** The caller's live DRAFT log by id, or null (not found / not theirs / submitted). */
function ownedDraft(userId: number, logId: number) {
  return db
    .select({ id: videoLogs.id })
    .from(videoLogs)
    .where(
      and(
        eq(videoLogs.id, logId),
        eq(videoLogs.userId, userId),
        eq(videoLogs.status, "draft"),
        isNull(videoLogs.deletedAt),
      ),
    )
    .get();
}

function touchLog(logId: number): void {
  db.update(videoLogs)
    .set({ updatedAt: sql`datetime('now')` })
    .where(eq(videoLogs.id, logId))
    .run();
}
