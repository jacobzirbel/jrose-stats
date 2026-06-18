/**
 * YouTube title → Pokémon matching engine.
 *
 * Ported verbatim (logic-identical) from the old `old-project/scripts/
 * seed-youtube.ts`. Pure functions, no DB — kept separate so they're unit-
 * testable (see reference/match.test.ts). The Go-rewrite "no lookbehind"
 * caveat does NOT apply: this is back in TS, and JS regex has lookbehind.
 */

export interface PokemonRow {
  dex: number;
  name: string; // PokéAPI slug, e.g. 'mr-mime', 'nidoran-f', 'farfetchd'
}

export interface LookupEntry {
  alias: string; // lowercase string to search for in a title
  dexNumbers: number[]; // usually one, but [29, 32] for bare "nidoran"
  apiName: string; // original slug (for display)
}

export interface MatchResult {
  dexNumbers: number[];
  apiName: string;
  matchedAlias: string;
}

/**
 * Build all lowercase aliases that might appear in a jrose11 video title for a
 * given PokéAPI slug. Tried longest-first so "charmander" is never shadowed by
 * "char". Nidoran gets NO bare alias here — titles that don't disambiguate
 * gender fall through to the explicit [29,32] catch-all in buildLookup.
 */
export function buildAliases(apiName: string): string[] {
  const name = apiName.toLowerCase();
  const aliases = new Set<string>();

  aliases.add(name); // nidoran-f, mr-mime, farfetchd
  aliases.add(name.replace(/-/g, " ")); // nidoran f, mr mime
  aliases.add(name.replace(/-/g, "")); // nidoranf, mrmime

  const overrides: Record<string, string[]> = {
    farfetchd: ["farfetch'd", "farfetched"],
    "nidoran-f": ["nidoran female", "nidoran-female", "nidoran♀", "nidoran (f)", "nidoran f"],
    "nidoran-m": ["nidoran male", "nidoran-male", "nidoran♂", "nidoran (m)", "nidoran m"],
    "mr-mime": ["mr. mime", "mr.mime", "mr mime", "mr-mime"],
  };

  const extra = overrides[name];
  if (extra) {
    // nidoran variants: drop the generic slug aliases (too ambiguous)
    if (name.startsWith("nidoran-")) aliases.clear();
    extra.forEach((a) => aliases.add(a));
  }

  return Array.from(aliases).filter((a) => a.length > 0);
}

/**
 * Flat lookup list sorted by alias length DESC, so longer aliases consume text
 * before shorter ones can match. The bare "nidoran" entry maps to BOTH dex
 * numbers [29,32] and sorts last (shortest) — fires only when neither
 * gender-specific alias matched first (the shared 2-mon video).
 */
export function buildLookup(pokemon: PokemonRow[]): LookupEntry[] {
  const entries: LookupEntry[] = [];

  for (const p of pokemon) {
    for (const alias of buildAliases(p.name)) {
      entries.push({ alias, dexNumbers: [p.dex], apiName: p.name });
    }
  }

  entries.push({ alias: "nidoran", dexNumbers: [29, 32], apiName: "nidoran (both)" });

  entries.sort((a, b) => b.alias.length - a.alias.length);
  return entries;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find ALL Pokémon mentioned in a title. Aliases tried longest-first; matched
 * text is blanked in a working copy so shorter aliases can't re-claim it.
 * Returns one entry usually, two for the shared Nidoran video.
 */
export function findAllPokemonInTitle(title: string, lookup: LookupEntry[]): MatchResult[] {
  let working = title.toLowerCase();
  const claimedDex = new Set<number>();
  const results: MatchResult[] = [];

  for (const entry of lookup) {
    if (entry.dexNumbers.every((d) => claimedDex.has(d))) continue;

    let didMatch = false;
    try {
      const pattern = new RegExp(`(?<![a-z])${escapeRegex(entry.alias)}(?![a-z])`, "ig");
      if (pattern.test(working)) {
        working = working.replace(
          new RegExp(`(?<![a-z])${escapeRegex(entry.alias)}(?![a-z])`, "ig"),
          " ".repeat(entry.alias.length),
        );
        didMatch = true;
      }
    } catch {
      if (working.includes(entry.alias)) {
        working = working.split(entry.alias).join(" ".repeat(entry.alias.length));
        didMatch = true;
      }
    }

    if (didMatch) {
      const newDex = entry.dexNumbers.filter((d) => !claimedDex.has(d));
      newDex.forEach((d) => claimedDex.add(d));
      results.push({ dexNumbers: newDex, apiName: entry.apiName, matchedAlias: entry.alias });
    }
  }

  return results;
}
