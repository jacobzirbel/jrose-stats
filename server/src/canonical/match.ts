/**
 * The matching process (Phase 2) — the automatic half of the lifecycle. Runs
 * when a log is submitted: across the run's submitted logs it moves claims
 * between the AUTOMATIC statuses only (`proposed ↔ agreed`, and ordinal
 * disagreement → `contested`). It never touches human-set states
 * (contested-by-review / overturned / certified) — once a person has ruled on a
 * fact, matching leaves it alone.
 *
 * Membership (absence is not an assertion): a fact two independent logs both
 * claim → `agreed`; one log → stays `proposed`. Two logs never *contradict* on
 * membership, so matching alone can't make a membership fact `contested` — that
 * comes from review. Ordinal (gyms): per-position, agreeing logs → `agreed`,
 * disagreeing logs → `contested` (the one place matching contests).
 */
import { inArray, sql } from "drizzle-orm";

import type { DB } from "../db/client";
import { eventClaims } from "../db/schema/core";

const ORDINAL = new Set(["gyms"]);

type Status = "proposed" | "agreed" | "contested" | "overturned" | "certified";
// HUMAN verdicts are sticky — matching never overwrites them. Everything else
// (proposed/agreed/contested) is matching's own output and is re-derived each
// run, so a fact that was auto-contested can return to `agreed` once the logs
// converge (e.g. a logger fixes a mistyped field value).
const STICKY = new Set<Status>(["overturned", "certified"]);

interface Row {
  id: number;
  logId: number;
  catalogItemId: number;
  categorySlug: string;
  timestampSec: number;
  status: Status;
}

/** Recompute automatic statuses for one run from its submitted logs' claims. */
export function runMatching(db: DB, runId: number): void {
  const rows = db.all<Row>(sql`
    SELECT ec.id AS id, ec.log_id AS logId, ec.catalog_item_id AS catalogItemId,
           cat.slug AS categorySlug, ec.timestamp_sec AS timestampSec, ec.status AS status
    FROM event_claims ec
    JOIN video_logs vl ON vl.id = ec.log_id
    JOIN catalog_items ci ON ci.id = ec.catalog_item_id
    JOIN categories cat ON cat.id = ci.category_id
    LEFT JOIN claim_run cr ON cr.claim_id = ec.id
    WHERE vl.deleted_at IS NULL
      AND ec.status IN ('proposed','agreed','contested','overturned','certified')
      AND COALESCE(
        cr.run_id,
        (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1)
      ) = ${runId}
  `);

  // Field VALUES are part of a fact's content: two logs that both tag an item
  // but disagree on a metadata value (the mimicked move, Brock's time) have NOT
  // actually agreed. Pull each claim's values as comparable identities (a
  // catalog ref vs a scalar) so the membership pass can spot the conflict.
  const fieldRows = db.all<{ claimId: number; slug: string; ident: string }>(sql`
    SELECT cf.claim_id AS claimId, f.slug AS slug,
           CASE WHEN cf.value_catalog_item_id IS NOT NULL
                THEN 'c' || cf.value_catalog_item_id
                ELSE 'v' || COALESCE(cf.value, '') END AS ident
    FROM claim_fields cf
    JOIN category_fields f ON f.id = cf.field_id
    JOIN event_claims ec ON ec.id = cf.claim_id
    JOIN video_logs vl ON vl.id = ec.log_id
    LEFT JOIN claim_run cr ON cr.claim_id = ec.id
    WHERE vl.deleted_at IS NULL
      AND COALESCE(
        cr.run_id,
        (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1)
      ) = ${runId}
  `);
  const fieldsByClaim = new Map<number, { slug: string; ident: string }[]>();
  for (const f of fieldRows) {
    (fieldsByClaim.get(f.claimId) ?? fieldsByClaim.set(f.claimId, []).get(f.claimId)!).push(f);
  }
  // True iff two logs DISAGREE on a field's value. We compare per-log value
  // sets: a log using Mimic twice (Tackle, Growl) isn't a conflict with itself,
  // and a value only one log recorded isn't a conflict (absence ≠ contradiction)
  // — only logs that each set the field, to different values, clash.
  const fieldsConflict = (group: Row[]): boolean => {
    const byLogSlug = new Map<number, Map<string, Set<string>>>();
    const slugs = new Set<string>();
    for (const r of group) {
      const slugMap = byLogSlug.get(r.logId) ?? new Map<string, Set<string>>();
      for (const f of fieldsByClaim.get(r.id) ?? []) {
        (slugMap.get(f.slug) ?? slugMap.set(f.slug, new Set()).get(f.slug)!).add(f.ident);
        slugs.add(f.slug);
      }
      byLogSlug.set(r.logId, slugMap);
    }
    for (const slug of slugs) {
      const perLog: string[] = [];
      for (const slugMap of byLogSlug.values()) {
        const set = slugMap.get(slug);
        if (set?.size) perLog.push([...set].sort().join(","));
      }
      if (new Set(perLog).size > 1) return true; // the logs that set it disagree
    }
    return false;
  };

  const targets = new Map<number, Status>(); // claimId -> new status (only where it changes)

  // --- membership: >=2 logs + values agree → agreed; values disagree → contested ---
  const byItem = new Map<number, Row[]>();
  for (const r of rows.filter((r) => !ORDINAL.has(r.categorySlug))) {
    (byItem.get(r.catalogItemId) ?? byItem.set(r.catalogItemId, []).get(r.catalogItemId)!).push(r);
  }
  for (const group of byItem.values()) {
    if (group.some((r) => STICKY.has(r.status))) continue; // a human has ruled — leave it
    const distinctLogs = new Set(group.map((r) => r.logId)).size;
    const target: Status =
      distinctLogs >= 2 ? (fieldsConflict(group) ? "contested" : "agreed") : "proposed";
    for (const r of group) if (r.status !== target) targets.set(r.id, target);
  }

  // --- ordinal: per position (each log's OWN clock) agree → agreed, differ → contested ---
  const byCatLog = new Map<string, Map<number, Row[]>>();
  for (const r of rows.filter((r) => ORDINAL.has(r.categorySlug))) {
    const logs = byCatLog.get(r.categorySlug) ?? new Map<number, Row[]>();
    (logs.get(r.logId) ?? logs.set(r.logId, []).get(r.logId)!).push(r);
    byCatLog.set(r.categorySlug, logs);
  }
  for (const logs of byCatLog.values()) {
    const byPos = new Map<number, Row[]>();
    for (const logRows of logs.values()) {
      [...logRows]
        .sort((a, b) => a.timestampSec - b.timestampSec)
        .forEach((r, i) => (byPos.get(i + 1) ?? byPos.set(i + 1, []).get(i + 1)!).push(r));
    }
    for (const group of byPos.values()) {
      if (group.some((r) => STICKY.has(r.status))) continue;
      const distinctItems = new Set(group.map((r) => r.catalogItemId)).size;
      const distinctLogs = new Set(group.map((r) => r.logId)).size;
      // Disagree on the gym at this position, OR agree on the gym but disagree
      // on a field value (e.g. Brock's in-game time) → contested.
      const target: Status =
        distinctItems > 1 || fieldsConflict(group)
          ? "contested"
          : distinctLogs >= 2
            ? "agreed"
            : "proposed";
      for (const r of group) if (r.status !== target) targets.set(r.id, target);
    }
  }

  // --- apply, batched by target status ---------------------------------------
  const byTarget = new Map<Status, number[]>();
  for (const [id, st] of targets) (byTarget.get(st) ?? byTarget.set(st, []).get(st)!).push(id);
  for (const [st, ids] of byTarget) {
    db.update(eventClaims).set({ status: st }).where(inArray(eventClaims.id, ids)).run();
  }
}

/**
 * Recompute a run's RECORD lifecycle. Runs after every status-moving event
 * (submit, concur/concede, review). The states:
 *
 *   logging      < two slots submitted
 *   reconciling  both submitted, an UNRESOLVED fact remains, loggers still own it
 *   escalated    loggers handed off (explicit `escalate`); admin owns cleanup —
 *                stays here until clean, never auto-relaxes back to reconciling
 *   live         both submitted AND nothing unresolved
 *
 * Unresolved = `proposed` (one-sided, unconfirmed) or `contested` (flagged, in
 * the queue). `overturned`/`certified`/`agreed` are SETTLED verdicts and don't
 * block. `live` LATCHES: once published, a post-live contest shows on the record
 * but never un-publishes — so we bail early if the run is already live.
 */
export function recomputeRecordState(db: DB, runId: number): void {
  const cur = db.all<{ s: string }>(sql`SELECT record_state AS s FROM runs WHERE id = ${runId}`)[0]?.s;
  if (cur === "live") return; // live latches

  const submitted = db.all<{ n: number }>(sql`
    SELECT COUNT(DISTINCT vl.id) AS n
    FROM video_logs vl
    JOIN run_videos rv ON rv.video_id = vl.video_id
    WHERE rv.run_id = ${runId} AND vl.status = 'submitted' AND vl.deleted_at IS NULL
  `)[0].n;

  let state: "logging" | "reconciling" | "escalated" | "live" = "logging";
  if (submitted >= 2) {
    const diff = db.all<{ n: number }>(sql`
      SELECT COUNT(*) AS n
      FROM event_claims ec
      JOIN video_logs vl ON vl.id = ec.log_id
      LEFT JOIN claim_run cr ON cr.claim_id = ec.id
      WHERE vl.deleted_at IS NULL
        AND ec.status IN ('proposed','contested')
        AND COALESCE(
          cr.run_id,
          (SELECT rv.run_id FROM run_videos rv WHERE rv.video_id = vl.video_id GROUP BY rv.video_id HAVING COUNT(*) = 1)
        ) = ${runId}
    `)[0].n;
    // Clean → live (both paths land here). Dirty → stay with admin if already
    // escalated, else it's the loggers' round.
    state = diff === 0 ? "live" : cur === "escalated" ? "escalated" : "reconciling";
  }
  db.run(sql`UPDATE runs SET record_state = ${state} WHERE id = ${runId}`);
}
