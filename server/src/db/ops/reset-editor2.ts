/**
 * One-off ops: remove ALL of editor2's logs and recompute every affected run's
 * status so it reflects the now-single-log reality.
 *
 * Why it's more than a DELETE: `live` LATCHES in recomputeRecordState, and the
 * remaining logger's claims still carry their old `agreed` status. So per
 * affected run we: clear the latch (reset record_state to 'logging'), re-run
 * matching (single-source facts agreed -> proposed), then settle record_state.
 *
 * Dry-run by default — prints what it WILL touch. Re-run with --apply to mutate.
 *   cd server && bun run src/db/ops/reset-editor2.ts            # preview
 *   cd server && bun run src/db/ops/reset-editor2.ts --apply    # do it
 */
import { sql } from "drizzle-orm";

import { recomputeRecordState, runMatching } from "../../canonical/match";
import { db, sqlite } from "../client";

const USERNAME = "editor2";
const APPLY = process.argv.includes("--apply");

const user = db.all<{ id: number }>(sql`SELECT id FROM users WHERE username = ${USERNAME}`)[0];
if (!user) {
  console.log(`No '${USERNAME}' user — nothing to do.`);
  sqlite.close();
  process.exit(0);
}

// Live logs only (soft-deleted ones are already out of every derivation).
const logs = db.all<{ id: number; videoId: number }>(sql`
  SELECT id, video_id AS videoId FROM video_logs
  WHERE user_id = ${user.id} AND deleted_at IS NULL
`);

// Runs those logs touch — captured BEFORE deletion so we can recompute them.
const runIds = new Set<number>();
for (const l of logs) {
  for (const r of db.all<{ runId: number }>(sql`SELECT run_id AS runId FROM run_videos WHERE video_id = ${l.videoId}`)) {
    runIds.add(r.runId);
  }
}

console.log(`editor2 (id=${user.id}): ${logs.length} live log(s), touching ${runIds.size} run(s).`);
for (const runId of runIds) {
  const st = db.all<{ s: string }>(sql`SELECT record_state AS s FROM runs WHERE id = ${runId}`)[0]?.s;
  const others = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM video_logs
    WHERE video_id IN (SELECT video_id FROM run_videos WHERE run_id = ${runId})
      AND user_id <> ${user.id} AND deleted_at IS NULL
  `)[0].n;
  console.log(`  run ${runId}: record_state='${st}' -> will become single-log (${others} other live log[s] remain)`);
}

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to mutate. Back up first: cp data/app.db data/app.db.bak");
  sqlite.close();
  process.exit(0);
}

// 1) Hard-delete editor2's logs. event_claims cascade from video_logs; claim_fields,
//    claim_run, coverage_spans cascade from event_claims. FKs are ON (client pragma).
// 2) Clear the `live` latch on affected runs so recompute can downgrade them.
db.transaction((tx) => {
  tx.run(sql`DELETE FROM video_logs WHERE user_id = ${user.id} AND deleted_at IS NULL`);
  for (const runId of runIds) {
    tx.run(sql`UPDATE runs SET record_state = 'logging' WHERE id = ${runId}`);
  }
});

// 3) Recompute each affected run from the surviving claims.
for (const runId of runIds) {
  runMatching(db, runId);
  recomputeRecordState(db, runId);
}

console.log(`Done. Deleted editor2's logs and recomputed ${runIds.size} run(s).`);
sqlite.close();
