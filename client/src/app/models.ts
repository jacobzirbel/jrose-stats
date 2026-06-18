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
