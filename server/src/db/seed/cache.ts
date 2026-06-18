/**
 * Loads the cached PokéAPI dump. The raw 45 MB JSON is committed gzipped
 * (seed/pokeapi-cache.json.gz, ~5-8 MB) and decompressed in memory here — we
 * NEVER re-fetch PokéAPI. Shape: { pokemonDetails: [...], moveDetails: [...] }.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export interface PokemonDetail {
  id: number;
  name: string;
  types: { type: { name: string } }[];
  moves: {
    move: { name: string };
    version_group_details: { version_group: { name: string } }[];
  }[];
}

export interface MoveDetail {
  id: number;
  name: string;
  damage_class: { name: string } | null;
}

export interface PokeApiCache {
  pokemonDetails: PokemonDetail[];
  moveDetails: MoveDetail[];
}

// repo-root/seed/pokeapi-cache.json.gz  (this file is src/db/seed/cache.ts)
const CACHE_URL = new URL("../../../seed/pokeapi-cache.json.gz", import.meta.url);

export function loadCache(): PokeApiCache {
  const gz = readFileSync(CACHE_URL);
  return JSON.parse(gunzipSync(gz).toString("utf-8")) as PokeApiCache;
}
