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
  liveRunId: number | null; // deep-link target for a published run
}

export interface SpineVideo {
  videoId: number;
  title: string | null;
  url: string | null;
  youtubeId: string | null;
  runId: number;
  partNo: number;
  loggerCount: number; // logger slots filled (0–2)
  recordState: 'logging' | 'reconciling' | 'escalated' | 'live';
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

export type CategoryFieldType = 'text' | 'number' | 'duration' | 'enum' | 'catalog_ref';

/** A configured per-claim metadata field (core's category_fields). */
export interface CategoryField {
  id: number;
  categoryId: number;
  catalogItemId: number | null; // null = whole category; set = item-scoped
  slug: string;
  label: string;
  type: CategoryFieldType;
  refCategorySlug: string | null; // catalog_ref: the category its picker draws from
  options: { value: string; label: string }[] | null; // enum only
  required: boolean;
  sortOrder: number;
}

/** A stored value for one (claim, field). Exactly one column is populated. */
export interface ClaimFieldValue {
  fieldId: number;
  value: string | null;
  valueCatalogItemId: number | null;
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
  fields?: ClaimFieldValue[];
}

export interface WorkbenchData {
  log: { id: number; status: string };
  video: { id: number; title: string | null; youtubeId: string | null; durationSec: number | null };
  runs: WorkbenchRun[];
  claims: Claim[];
}

export interface Violation {
  code: string;
  message: string;
  claimId?: number | null;
}

/** mm:ss for a second offset. */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/** Inverse of `clock`: "3:42" or bare "222" -> seconds; null if unparseable. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const mm = Number(m);
    const ss = Number(s);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss < 0 || ss >= 60) return null;
    return mm * 60 + ss;
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
