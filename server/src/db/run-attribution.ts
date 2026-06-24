import { type SQL, sql } from "drizzle-orm";

/**
 * SQL expression for the run a claim is attributed to: its explicit
 * `claim_run.run_id`, else the sole run of the log's video. This is the one
 * definition of "which run does this claim belong to" — previously copy-pasted
 * across the matcher, canonical derivation, review, and the admin queue.
 *
 * Assumes the surrounding query has `event_claims` joined to `video_logs vl`
 * and a `LEFT JOIN claim_run cr ON cr.claim_id = ...` — the standard aliases
 * used everywhere this is embedded. Returns a fresh fragment per call so it
 * composes safely wherever it's interpolated.
 */
export const attributedRunId = (): SQL =>
  sql`COALESCE(cr.run_id, (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1))`;
