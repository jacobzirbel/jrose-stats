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
}

export interface SpineVideo {
  videoId: number;
  title: string | null;
  url: string | null;
  youtubeId: string | null;
  runId: number;
  partNo: number;
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

/** The 151 spine cells, sorted by dex (default) or playlist position. */
export function getSpine(db: DB, sort: "dex" | "playlist" = "dex"): SpineCell[] {
  // Output-alias ORDER BY; NULL playlistPos (no video yet) sorts last.
  const order = sort === "playlist" ? sql`playlistPos IS NULL, playlistPos, dex` : sql`dex`;
  return db.all<SpineCell>(sql`
    SELECT
      p.dex AS dex,
      p.name AS name,
      COALESCE((
        SELECT r.status FROM runs r
        WHERE r.pokemon_dex = p.dex
        ORDER BY ${STATUS_RANK} LIMIT 1
      ), 'untouched') AS status,
      (SELECT COUNT(*) FROM run_videos rv
        JOIN runs r ON r.id = rv.run_id
        WHERE r.pokemon_dex = p.dex) AS videoCount,
      (SELECT MIN(v.playlist_pos) FROM run_videos rv
        JOIN runs r ON r.id = rv.run_id
        JOIN videos v ON v.id = rv.video_id
        WHERE r.pokemon_dex = p.dex) AS playlistPos
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
      COALESCE((
        SELECT r.status FROM runs r
        WHERE r.pokemon_dex = p.dex
        ORDER BY ${STATUS_RANK} LIMIT 1
      ), 'untouched') AS status
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
      rv.part_no AS partNo
    FROM run_videos rv
    JOIN runs r ON r.id = rv.run_id
    JOIN videos v ON v.id = rv.video_id
    WHERE r.pokemon_dex = ${dex}
    ORDER BY v.playlist_pos, rv.part_no
  `);
  return { ...head, videos };
}
