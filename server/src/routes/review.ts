/**
 * Review API (Phase 2) — the human half of the lifecycle. Anyone signed in may
 * review (no role gate yet — "review from anyone", incl. the two loggers); role
 * gating is the eventual hardening. A review acts on the whole FACT: it applies
 * the new status to every claim sharing the target claim's catalog item within
 * the same run.
 *
 *   contest  → contested   (flag a fact wrong; into the queue)
 *   certify  → certified   (a challenge failed / vouch; hardened above agreed)
 *   overturn → overturned  (judged incorrect)
 */
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { type AppEnv, requireAuth } from "../auth/middleware";
import { recomputeRecordState } from "../canonical/match";
import { db } from "../db/client";

export const reviewRoutes = new Hono<AppEnv>();

const ACTION_STATUS: Record<string, "contested" | "certified" | "overturned"> = {
  contest: "contested",
  certify: "certified",
  overturn: "overturned",
};

reviewRoutes.post("/claims/:claimId/review", requireAuth, async (c) => {
  const claimId = Number(c.req.param("claimId"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const target = ACTION_STATUS[String(body.action)];
  if (!Number.isInteger(claimId) || !target) {
    return c.json({ error: "claimId and a valid action (contest|certify|overturn) are required." }, 400);
  }

  // Resolve the claim's fact key (catalog item) + its run (same attribution as elsewhere).
  const claim = db.all<{ catalogItemId: number; runId: number | null }>(sql`
    SELECT ec.catalog_item_id AS catalogItemId,
           COALESCE(cr.run_id,
             (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1)
           ) AS runId
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    LEFT JOIN claim_run cr ON cr.claim_id = ec.id
    WHERE ec.id = ${claimId} AND vl.deleted_at IS NULL
  `)[0];
  if (!claim || claim.runId == null) return c.json({ error: "Claim not found" }, 404);

  // Review opens once the run is `live` (then anyone signed in may review).
  // Before that, only an admin reviews — that's the `escalated` cleanup path.
  const user = c.get("user")!;
  const recordState = db.all<{ s: string }>(
    sql`SELECT record_state AS s FROM runs WHERE id = ${claim.runId}`,
  )[0]?.s;
  if (recordState !== "live" && user.role !== "admin") {
    return c.json({ error: "Review opens once the run is live.", recordState }, 403);
  }

  // Apply to the whole fact: same catalog item, same run, visible claims only.
  db.run(sql`
    UPDATE event_claims SET status = ${target}
    WHERE catalog_item_id = ${claim.catalogItemId}
      AND status IN ('proposed','agreed','contested','overturned','certified')
      AND id IN (
        SELECT ec.id FROM event_claims ec
        JOIN video_logs vl ON vl.id = ec.log_id
        LEFT JOIN claim_run cr ON cr.claim_id = ec.id
        WHERE vl.deleted_at IS NULL
          AND COALESCE(cr.run_id,
            (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1)
          ) = ${claim.runId}
      )
  `);

  // Settling the last diff during `escalated` lets the run go `live`; once live
  // it latches, so a post-live contest re-flags the fact without un-publishing.
  recomputeRecordState(db, claim.runId);
  return c.json({ ok: true, status: target });
});
