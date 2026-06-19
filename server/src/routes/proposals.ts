/**
 * Proposals API — the "propose" half of review. A signed-in reviewer flags a
 * fact neither blind logger caught; it rides alongside the claims as a PENDING
 * proposal (reviewers have no video_log of their own). An admin then accepts it
 * — folding it into the canonical record as a certified fact — or rejects it.
 *
 *   POST /api/runs/:runId/proposals   propose a missing fact (live run, or admin)
 *   POST /api/proposals/:id/accept    admin: fold into the record
 *   POST /api/proposals/:id/reject    admin: discard
 */
import { sql } from "drizzle-orm";
import { type Context, Hono } from "hono";

import { type AppEnv, requireAuth } from "../auth/middleware";
import { db } from "../db/client";
import { proposals } from "../db/schema";

export const proposalRoutes = new Hono<AppEnv>();

proposalRoutes.post("/runs/:runId/proposals", requireAuth, async (c) => {
  const user = c.get("user")!;
  const runId = Number(c.req.param("runId"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const catalogItemId = Number(body.catalogItemId);
  const videoId = Number(body.videoId);
  const timestampSec = Number(body.timestampSec);
  const note = body.note != null ? String(body.note) : null;
  if (
    !Number.isInteger(runId) ||
    !Number.isInteger(catalogItemId) ||
    !Number.isInteger(videoId) ||
    !Number.isFinite(timestampSec) ||
    timestampSec < 0
  ) {
    return c.json({ error: "runId, catalogItemId, videoId and a non-negative timestampSec are required." }, 400);
  }

  const recordState = db.all<{ s: string }>(sql`SELECT record_state AS s FROM runs WHERE id = ${runId}`)[0]?.s;
  if (recordState == null) return c.json({ error: "Run not found" }, 404);
  // Proposing is review — open once the run is live (admins may act earlier).
  if (recordState !== "live" && user.role !== "admin") {
    return c.json({ error: "Proposals open once the run is live.", recordState }, 403);
  }

  const hostsVideo = db.all<{ one: number }>(
    sql`SELECT 1 AS one FROM run_videos WHERE run_id = ${runId} AND video_id = ${videoId} LIMIT 1`,
  )[0];
  if (!hostsVideo) return c.json({ error: "That video isn't part of this run." }, 400);
  const item = db.all<{ one: number }>(sql`SELECT 1 AS one FROM catalog_items WHERE id = ${catalogItemId} LIMIT 1`)[0];
  if (!item) return c.json({ error: "Unknown catalog item." }, 400);

  const row = db
    .insert(proposals)
    .values({ runId, videoId, catalogItemId, timestampSec, proposedBy: user.id, note })
    .returning({ id: proposals.id })
    .get();
  return c.json({ id: row.id, status: "pending" }, 201);
});

/** Admin verdict on a pending proposal. */
function verdict(c: Context<AppEnv>, action: "accepted" | "rejected") {
  const user = c.get("user")!;
  if (user.role !== "admin") return c.json({ error: "Accepting and rejecting proposals is admin-only." }, 403);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad proposal id" }, 400);
  db.run(sql`UPDATE proposals SET status = ${action} WHERE id = ${id} AND status = 'pending'`);
  return c.json({ ok: true, status: action });
}

proposalRoutes.post("/proposals/:id/accept", requireAuth, (c) => verdict(c, "accepted"));
proposalRoutes.post("/proposals/:id/reject", requireAuth, (c) => verdict(c, "rejected"));
