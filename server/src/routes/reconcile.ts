/**
 * Reconciliation API. Loggers resolve disagreements by editing their own logs
 * in the workbench (add a missing event, re-timestamp a gym, fix a field value)
 * and resubmitting — matching then re-derives and the run goes live once the
 * logs converge. The only endpoint here is the optional fallback:
 *
 *   escalate → loggers can't agree; hand the remaining diff to an admin.
 */
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { type AppEnv, requireAuth } from "../auth/middleware";
import { db } from "../db/client";

export const reconcileRoutes = new Hono<AppEnv>();

/** Is this user one of the run's loggers (a logger on one of its videos)? */
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

const recordStateOf = (runId: number): string | null =>
  db.all<{ s: string }>(sql`SELECT record_state AS s FROM runs WHERE id = ${runId}`)[0]?.s ?? null;

/** escalate: the loggers couldn't converge — hand the remaining diff to admin. */
reconcileRoutes.post("/runs/:runId/reconcile/escalate", requireAuth, (c) => {
  const user = c.get("user")!;
  const runId = Number(c.req.param("runId"));
  if (!Number.isInteger(runId)) return c.json({ error: "Bad run id" }, 400);
  if (!isLoggerOf(runId, user.id)) return c.json({ error: "Only the run's loggers can escalate." }, 403);
  if (recordStateOf(runId) !== "reconciling") return c.json({ error: "Run isn't in reconciliation." }, 409);

  db.run(sql`UPDATE runs SET record_state = 'escalated' WHERE id = ${runId}`);
  return c.json({ ok: true, recordState: "escalated" });
});
