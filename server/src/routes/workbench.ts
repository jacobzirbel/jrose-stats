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

import { type AppEnv, requireAuth } from "../auth/middleware";
import { db } from "../db/client";
import {
  catalogItems,
  categories,
  claimRun,
  eventClaims,
  videoLogs,
  videos,
} from "../db/schema";

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

  return c.json({
    categories: cats.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      label: cat.label,
      keybind: cat.keybind,
      required: cat.required === 1,
      items: (byCategory.get(cat.id) ?? []).map(({ id, slug, label }) => ({ id, slug, label })),
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

  // One live log per (user, video); create a draft if none exists.
  let log = db
    .select({ id: videoLogs.id, status: videoLogs.status })
    .from(videoLogs)
    .where(
      and(eq(videoLogs.userId, user.id), eq(videoLogs.videoId, videoId), isNull(videoLogs.deletedAt)),
    )
    .get();
  if (!log) {
    log = db
      .insert(videoLogs)
      .values({ userId: user.id, videoId })
      .returning({ id: videoLogs.id, status: videoLogs.status })
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

  const claims = db.all<{
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

// --- delete a claim ---------------------------------------------------------
workbenchRoutes.delete("/claims/:claimId", requireAuth, (c) => {
  const user = c.get("user")!;
  const claimId = Number(c.req.param("claimId"));

  // Only the owner of the claim's log may delete it.
  const owned = db.get<{ id: number }>(sql`
    SELECT ec.id AS id
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    WHERE ec.id = ${claimId} AND vl.user_id = ${user.id} AND vl.deleted_at IS NULL
  `);
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
