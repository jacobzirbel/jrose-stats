/**
 * Canonical API — the read-only derived view over claims (Phase 1, ahead of the
 * Phase-2 crowd). Public: anyone may read canonical/contested/pending facts for
 * a run, with provenance for drill-down. Nothing is written; "finalized" is just
 * what the query computes.
 */
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../auth/middleware";
import { getCanonicalRun } from "../canonical";
import { db } from "../db/client";

export const canonicalRoutes = new Hono<AppEnv>();

/** Is this user one of the run's two slot-holders (a logger on its video)? */
function isLoggerOf(runId: number, userId: number): boolean {
  return (
    db.all<{ one: number }>(sql`
      SELECT 1 AS one FROM video_logs vl
      JOIN run_videos rv ON rv.video_id = vl.video_id
      WHERE rv.run_id = ${runId} AND vl.user_id = ${userId} AND vl.deleted_at IS NULL
      LIMIT 1
    `).length > 0
  );
}

canonicalRoutes.get("/runs/:runId/canonical", (c) => {
  const runId = Number(c.req.param("runId"));
  const view = Number.isInteger(runId) ? getCanonicalRun(db, runId) : null;
  if (!view) return c.json({ error: "Run not found" }, 404);

  // Visibility gate: until a run is `live`, only its two loggers + admins see
  // the details. Third parties get the state, not the facts.
  if (view.recordState !== "live") {
    const user = c.get("user");
    const allowed = !!user && (user.role === "admin" || isLoggerOf(runId, user.id));
    if (!allowed) {
      return c.json({ runId, recordState: view.recordState, gated: true }, 403);
    }
  }
  return c.json(view);
});
