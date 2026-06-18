/**
 * 1B-2 — video + run-link seed. Fetches the jrose11 playlist, matches each
 * title to Pokémon via the ported engine (./match), and writes `videos` +
 * `run_videos` links. The shared Nidoran video produces TWO run_videos rows.
 *
 * The playlist+durations response is cached to seed/youtube-playlist.json on
 * first fetch so re-seeds are reproducible and don't re-hit the YouTube API.
 * Idempotent: existing youtube_ids are skipped; run_videos onConflictDoNothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { DB } from "../client";
import { pokemon, runs, runVideos, videos } from "../schema";
import { buildLookup, findAllPokemonInTitle, type PokemonRow } from "./match";

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const PLAYLIST_CACHE = new URL("../../../seed/youtube-playlist.json", import.meta.url);

interface PlaylistItem {
  title: string;
  videoId: string;
  publishedAt: string;
  position: number;
  durationSec: number | null;
}

// Minimal shapes of the YouTube Data API responses we read (res.json() is unknown).
interface PlaylistItemsResponse {
  items: {
    snippet: {
      title: string;
      publishedAt: string;
      position: number;
      resourceId?: { videoId?: string };
    };
  }[];
  nextPageToken?: string;
}

interface VideosResponse {
  items: { id: string; contentDetails: { duration: string } }[];
}

// --- YouTube API -----------------------------------------------------------

async function fetchPlaylistPage(
  playlistId: string,
  apiKey: string,
  pageToken?: string,
): Promise<{ items: PlaylistItem[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    playlistId,
    maxResults: "50",
    key: apiKey,
    ...(pageToken ? { pageToken } : {}),
  });
  const res = await fetch(`${YT_BASE}/playlistItems?${params}`);
  if (!res.ok) throw new Error(`YouTube playlistItems error: ${JSON.stringify(await res.json())}`);
  const data = (await res.json()) as PlaylistItemsResponse;

  const items: PlaylistItem[] = [];
  for (const item of data.items) {
    const s = item.snippet;
    if (!s.resourceId?.videoId || s.title === "Deleted video" || s.title === "Private video") continue;
    items.push({
      title: s.title,
      videoId: s.resourceId.videoId,
      publishedAt: s.publishedAt,
      position: s.position,
      durationSec: null,
    });
  }
  return { items, nextPageToken: data.nextPageToken };
}

/** ISO-8601 duration (PT#H#M#S) → seconds. */
function parseDuration(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [h, min, s] = [m[1], m[2], m[3]].map((x) => (x ? Number(x) : 0));
  return h * 3600 + min * 60 + s;
}

async function fillDurations(items: PlaylistItem[], apiKey: string): Promise<void> {
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "contentDetails",
      id: batch.map((b) => b.videoId).join(","),
      key: apiKey,
    });
    const res = await fetch(`${YT_BASE}/videos?${params}`);
    if (!res.ok) throw new Error(`YouTube videos error: ${JSON.stringify(await res.json())}`);
    const data = (await res.json()) as VideosResponse;
    const byId = new Map<string, string>(data.items.map((v) => [v.id, v.contentDetails.duration]));
    for (const b of batch) {
      const iso = byId.get(b.videoId);
      b.durationSec = iso ? parseDuration(iso) : null;
    }
  }
}

async function loadPlaylist(playlistId: string, apiKey: string): Promise<PlaylistItem[]> {
  if (existsSync(PLAYLIST_CACHE)) {
    return JSON.parse(readFileSync(PLAYLIST_CACHE, "utf-8")) as PlaylistItem[];
  }
  const all: PlaylistItem[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchPlaylistPage(playlistId, apiKey, pageToken);
    all.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);
  await fillDurations(all, apiKey);
  writeFileSync(PLAYLIST_CACHE, JSON.stringify(all, null, 2));
  return all;
}

// --- seed ------------------------------------------------------------------

export interface YoutubeSeedResult {
  videosInserted: number;
  runLinks: number;
  unmatched: string[];
}

export async function seedYoutube(db: DB): Promise<YoutubeSeedResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;
  if (!apiKey || !playlistId) {
    throw new Error("YOUTUBE_API_KEY and YOUTUBE_PLAYLIST_ID must be set in .env for 1B-2");
  }

  const pokemonRows = db.select({ dex: pokemon.dex, name: pokemon.name }).from(pokemon).all();
  if (pokemonRows.length === 0) throw new Error("No pokemon in DB — run the reference seed (db:seed) first");
  const lookup = buildLookup(pokemonRows as PokemonRow[]);

  const runIdByDex = new Map(
    db.select({ dex: runs.pokemonDex, id: runs.id }).from(runs).all().map((r) => [r.dex, r.id]),
  );

  const items = await loadPlaylist(playlistId, apiKey);
  const existing = new Set(db.select({ yt: videos.youtubeId }).from(videos).all().map((v) => v.yt));

  let videosInserted = 0;
  let runLinks = 0;
  const unmatched: string[] = [];

  for (const item of items) {
    const matches = findAllPokemonInTitle(item.title, lookup);
    if (matches.length === 0) {
      unmatched.push(item.title);
      continue;
    }
    if (existing.has(item.videoId)) continue;

    const [inserted] = db
      .insert(videos)
      .values({
        title: item.title,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        youtubeId: item.videoId,
        playlistPos: item.position,
        publishedAt: item.publishedAt,
        durationSec: item.durationSec,
      })
      .returning({ id: videos.id })
      .all();
    videosInserted++;

    const dexNumbers = matches.flatMap((m) => m.dexNumbers);
    for (const dex of dexNumbers) {
      const runId = runIdByDex.get(dex);
      if (runId == null) continue;
      db.insert(runVideos)
        .values({ runId, videoId: inserted!.id, partNo: 1 })
        .onConflictDoNothing()
        .run();
      runLinks++;
    }
  }

  return { videosInserted, runLinks, unmatched };
}
