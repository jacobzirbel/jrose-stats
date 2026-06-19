/**
 * Canonical API — the read-only derived view over claims (Phase 1, ahead of the
 * Phase-2 crowd). Public: anyone may read canonical/contested/pending facts for
 * a run, with provenance for drill-down. Nothing is written; "finalized" is just
 * what the query computes.
 */
import { Hono } from "hono";

import type { AppEnv } from "../auth/middleware";
import { getCanonicalRun } from "../canonical";
import { db } from "../db/client";

export const canonicalRoutes = new Hono<AppEnv>();

canonicalRoutes.get("/runs/:runId/canonical", (c) => {
  const runId = Number(c.req.param("runId"));
  const view = Number.isInteger(runId) ? getCanonicalRun(db, runId) : null;
  if (!view) return c.json({ error: "Run not found" }, 404);
  return c.json(view);
});
