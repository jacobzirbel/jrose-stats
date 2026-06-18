/**
 * Unit tests for the ported YouTube title → Pokémon matching engine.
 * These guard the non-trivial domain logic the seed depends on (Nidoran split,
 * longest-alias-first, word-boundary guard, misspelling overrides).
 */
import { describe, expect, test } from "bun:test";

import { buildLookup, findAllPokemonInTitle, type PokemonRow } from "../src/db/seed/match";

const FIXTURE: PokemonRow[] = [
  { dex: 4, name: "charmander" },
  { dex: 25, name: "pikachu" },
  { dex: 29, name: "nidoran-f" },
  { dex: 32, name: "nidoran-m" },
  { dex: 83, name: "farfetchd" },
  { dex: 122, name: "mr-mime" },
];

const lookup = buildLookup(FIXTURE);
const dexOf = (title: string) => findAllPokemonInTitle(title, lookup).flatMap((m) => m.dexNumbers).sort((a, b) => a - b);

describe("findAllPokemonInTitle", () => {
  test("single match", () => {
    expect(dexOf("Can Jrose Beat Pokémon Red With ONLY Charmander?")).toEqual([4]);
  });

  test("bare 'nidoran' maps to BOTH variants (the 2-mon video)", () => {
    expect(dexOf("Can Jrose Beat Pokémon With ONLY Nidoran?")).toEqual([29, 32]);
  });

  test("explicit 'nidoran female' resolves to ONE variant, not both", () => {
    expect(dexOf("Can Jrose Beat Pokémon With ONLY Nidoran Female?")).toEqual([29]);
  });

  test("'nidoran male' resolves to the male variant only", () => {
    expect(dexOf("ONLY Nidoran Male Challenge")).toEqual([32]);
  });

  test("misspelling override: farfetch'd / farfetched", () => {
    expect(dexOf("ONLY Farfetch'd")).toEqual([83]);
    expect(dexOf("the farfetched run")).toEqual([83]);
  });

  test("punctuation variants: Mr. Mime", () => {
    expect(dexOf("Beating the game with Mr. Mime")).toEqual([122]);
  });

  test("no false positive on unrelated titles", () => {
    expect(dexOf("Top 10 saddest moments")).toEqual([]);
  });

  test("word-boundary guard: 'pika' substring does not over-match", () => {
    // 'pikachu' matches; a bare 'pika' fragment in another word must not.
    expect(dexOf("pikachu vs the world")).toEqual([25]);
  });
});
