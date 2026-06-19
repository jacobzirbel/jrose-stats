/**
 * Read queries backing the 151-grid spine (Phase 1D). Public — no auth needed
 * to view the spine; logging is what requires an account.
 *
 * A pokemon's displayed status is the MOST-PROGRESSED of its runs (a mon can
 * have re-attempts). The video-indicator dot is driven by `run_videos` links,
 * independent of status (a video can exist before anyone's logged the run).
 */
import { sql } from "drizzle-orm";

import type { DB } from "../client";

export type RunStatus = "untouched" | "in_progress" | "done" | "impossible_abandoned";

export interface SpineCell {
  dex: number;
  name: string;
  status: RunStatus;
  videoCount: number;
  playlistPos: number | null;
  liveRunId: number | null; // a published run to deep-link to; null if none yet
}

export interface SpineVideo {
  videoId: number;
  title: string | null;
  url: string | null;
  youtubeId: string | null;
  runId: number;
  partNo: number;
  loggerCount: number; // logger slots filled (0–2); a video goes live once two loggers agree
  recordState: string; // the run's record lifecycle: logging | reconciling | escalated | live
}

export interface PokemonDetail {
  dex: number;
  name: string;
  status: RunStatus;
  videos: SpineVideo[];
}

// Order runs by progress so the "best" one wins for the grid cell.
const STATUS_RANK = sql`CASE status
  WHEN 'done' THEN 0
  WHEN 'in_progress' THEN 1
  WHEN 'impossible_abandoned' THEN 2
  ELSE 3 END`;

// The most-progressed in-game status across a pokemon's runs (default untouched).
const BASE_STATUS = sql`COALESCE((
  SELECT r.status FROM runs r
  WHERE r.pokemon_dex = p.dex
  ORDER BY ${STATUS_RANK} LIMIT 1
), 'untouched')`;

// Has anyone started logging this pokemon's runs? (a claimed slot counts).
const HAS_LOGS = sql`EXISTS (
  SELECT 1 FROM video_logs vl
  JOIN run_videos rv ON rv.video_id = vl.video_id
  JOIN runs r2 ON r2.id = rv.run_id
  WHERE r2.pokemon_dex = p.dex AND vl.deleted_at IS NULL
)`;

// Does this pokemon have a published (live) run record?
const HAS_LIVE = sql`EXISTS (
  SELECT 1 FROM runs r3 WHERE r3.pokemon_dex = p.dex AND r3.record_state = 'live'
)`;

// Displayed status follows the record lifecycle, but a genuine outcome wins:
//   abandoned/done set on the run  → kept
//   a published (live) record      → done (it's finished + verified)
//   logged but not yet published   → in_progress
//   nothing logged                 → untouched
const DISPLAY_STATUS = sql`CASE
  WHEN ${BASE_STATUS} = 'impossible_abandoned' THEN 'impossible_abandoned'
  WHEN ${BASE_STATUS} = 'done' THEN 'done'
  WHEN ${HAS_LIVE} THEN 'done'
  WHEN ${HAS_LOGS} THEN 'in_progress'
  ELSE 'untouched' END`;

/** The 151 spine cells, sorted by dex (default) or playlist position. */
export function getSpine(db: DB, sort: "dex" | "playlist" = "dex"): SpineCell[] {
  // Output-alias ORDER BY; NULL playlistPos (no video yet) sorts last.
  const order = sort === "playlist" ? sql`playlistPos IS NULL, playlistPos, dex` : sql`dex`;
  return db.all<SpineCell>(sql`
    SELECT
      p.dex AS dex,
      p.name AS name,
      ${DISPLAY_STATUS} AS status,
      (SELECT COUNT(*) FROM run_videos rv
        JOIN runs r ON r.id = rv.run_id
        WHERE r.pokemon_dex = p.dex) AS videoCount,
      (SELECT MIN(v.playlist_pos) FROM run_videos rv
        JOIN runs r ON r.id = rv.run_id
        JOIN videos v ON v.id = rv.video_id
        WHERE r.pokemon_dex = p.dex) AS playlistPos,
      (SELECT r.id FROM runs r
        WHERE r.pokemon_dex = p.dex AND r.record_state = 'live'
        ORDER BY r.id LIMIT 1) AS liveRunId
    FROM pokemon p
    WHERE p.dex BETWEEN 1 AND 151
    ORDER BY ${order}
  `);
}

/** One pokemon + its linked videos, or null if the dex isn't in the spine. */
export function getPokemonDetail(db: DB, dex: number): PokemonDetail | null {
  const head = db.all<{ dex: number; name: string; status: RunStatus }>(sql`
    SELECT
      p.dex AS dex,
      p.name AS name,
      ${DISPLAY_STATUS} AS status
    FROM pokemon p
    WHERE p.dex = ${dex} AND p.dex BETWEEN 1 AND 151
  `)[0];
  if (!head) return null;

  const videos = db.all<SpineVideo>(sql`
    SELECT
      v.id AS videoId,
      v.title AS title,
      v.url AS url,
      v.youtube_id AS youtubeId,
      rv.run_id AS runId,
      rv.part_no AS partNo,
      (SELECT COUNT(*) FROM video_logs vl
        WHERE vl.video_id = v.id AND vl.deleted_at IS NULL) AS loggerCount,
      r.record_state AS recordState
    FROM run_videos rv
    JOIN runs r ON r.id = rv.run_id
    JOIN videos v ON v.id = rv.video_id
    WHERE r.pokemon_dex = ${dex}
    ORDER BY v.playlist_pos, rv.part_no
  `);
  return { ...head, videos };
}
