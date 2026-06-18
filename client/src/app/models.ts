/** Shapes returned by the Hono JSON API (mirrors server/src/db/queries + auth). */

export type RunStatus = 'untouched' | 'in_progress' | 'done' | 'impossible_abandoned';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  points: number;
}

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

// --- workbench (1E) ---------------------------------------------------------

export interface CatalogItem {
  id: number;
  slug: string;
  label: string;
}

export interface Category {
  id: number;
  slug: string;
  label: string;
  keybind: string | null;
  required: boolean;
  items: CatalogItem[];
}

export interface WorkbenchRun {
  id: number;
  pokemonDex: number;
  name: string;
  status: RunStatus;
  partNo: number;
}

export interface Claim {
  id: number;
  catalogItemId: number;
  timestampSec: number;
  note: string | null;
  runId: number | null;
}

export interface WorkbenchData {
  log: { id: number; status: string };
  video: { id: number; title: string | null; youtubeId: string | null; durationSec: number | null };
  runs: WorkbenchRun[];
  claims: Claim[];
}

/** mm:ss for a second offset. */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  untouched: 'Untouched',
  in_progress: 'In progress',
  done: 'Done',
  impossible_abandoned: 'Abandoned',
};

/** "bulbasaur" / "nidoran-f" -> "Bulbasaur" / "Nidoran F". Server stores lowercase. */
export function titleCase(name: string): string {
  return name
    .split(/[\s-]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Pokémon sprite by dex number, from the PokéAPI sprite CDN. */
export function spriteUrl(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;
}
