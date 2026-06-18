/**
 * 1B-1 — offline reference seed. Reads the local PokéAPI cache (no network) +
 * static category/gym data and populates the domain reference tables plus their
 * core catalog_items bridge. Idempotent: re-runnable via onConflictDoNothing.
 *
 * Write order respects the core/domain bridge: categories → catalog_items →
 * domain lookups (moves/gyms point AT catalog_items). pokemon → runs last.
 */
import { eq } from "drizzle-orm";

import type { DB } from "../client";
import { catalogItems, categories, gyms, moves, pokemon, pokemonMoves, runs } from "../schema";
import { loadCache } from "./cache";
import { CATEGORIES, GEN1_VERSION_GROUPS, GYMS, MISSINGNO } from "./static-data";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function chunked<T>(rows: T[], run: (chunk: T[]) => void, size = 500): void {
  for (let i = 0; i < rows.length; i += size) run(rows.slice(i, i + size));
}

export interface SeedCounts {
  categories: number;
  pokemon: number;
  moves: number;
  learnset: number;
  gyms: number;
  runs: number;
}

export function seedReference(db: DB): SeedCounts {
  const cache = loadCache();
  const moveIdByName = new Map(cache.moveDetails.map((m) => [m.name, m.id]));

  return db.transaction((tx): SeedCounts => {
    // 1. categories ---------------------------------------------------------
    tx.insert(categories).values(CATEGORIES.map((c) => ({ ...c }))).onConflictDoNothing().run();
    const catRows = tx.select({ id: categories.id, slug: categories.slug }).from(categories).all();
    const catBySlug = new Map(catRows.map((c) => [c.slug, c.id]));
    const movesCat = catBySlug.get("moves")!;
    const gymsCat = catBySlug.get("gyms")!;

    // 2. pokemon (151 + MissingNo) -----------------------------------------
    const pokemonRows = cache.pokemonDetails.map((p) => ({
      dex: p.id,
      name: p.name,
      isGlitch: 0,
      type1: p.types[0]?.type.name ?? null,
      type2: p.types[1]?.type.name ?? null,
    }));
    tx.insert(pokemon).values(pokemonRows).onConflictDoNothing().run();
    tx.insert(pokemon).values({ ...MISSINGNO }).onConflictDoNothing().run();

    // 3. moves → catalog_items bridge + moves lookup -----------------------
    const moveCatalogRows = cache.moveDetails.map((m) => ({
      categoryId: movesCat,
      slug: m.name,
      label: titleCase(m.name),
      status: "active" as const,
    }));
    chunked(moveCatalogRows, (c) => tx.insert(catalogItems).values(c).onConflictDoNothing().run());

    const moveCatItems = tx
      .select({ id: catalogItems.id, slug: catalogItems.slug })
      .from(catalogItems)
      .where(eq(catalogItems.categoryId, movesCat))
      .all();
    const moveCatBySlug = new Map(moveCatItems.map((r) => [r.slug, r.id]));

    const moveRows = cache.moveDetails.map((m) => ({
      id: m.id, // PokéAPI id = domain identity
      catalogItemId: moveCatBySlug.get(m.name)!,
      name: m.name,
      category: m.damage_class?.name ?? null,
    }));
    chunked(moveRows, (c) => tx.insert(moves).values(c).onConflictDoNothing().run());

    // 4. learnset (Gen-1 filtered) -----------------------------------------
    const learnsetRows: { pokemonDex: number; moveId: number }[] = [];
    for (const p of cache.pokemonDetails) {
      for (const mv of p.moves) {
        const isGen1 = mv.version_group_details.some((vg) =>
          GEN1_VERSION_GROUPS.has(vg.version_group.name),
        );
        if (!isGen1) continue;
        const moveId = moveIdByName.get(mv.move.name);
        if (moveId != null) learnsetRows.push({ pokemonDex: p.id, moveId });
      }
    }
    chunked(learnsetRows, (c) => tx.insert(pokemonMoves).values(c).onConflictDoNothing().run());

    // 5. gyms → catalog_items bridge + gyms lookup -------------------------
    tx.insert(catalogItems)
      .values(
        GYMS.map((g) => ({ categoryId: gymsCat, slug: g.slug, label: g.label, status: "active" as const })),
      )
      .onConflictDoNothing()
      .run();
    const gymCatItems = tx
      .select({ id: catalogItems.id, slug: catalogItems.slug })
      .from(catalogItems)
      .where(eq(catalogItems.categoryId, gymsCat))
      .all();
    const gymCatBySlug = new Map(gymCatItems.map((r) => [r.slug, r.id]));
    tx.insert(gyms)
      .values(
        GYMS.map((g) => ({
          catalogItemId: gymCatBySlug.get(g.slug)!,
          leader: g.leader,
          city: g.city,
          canonicalOrder: g.order,
        })),
      )
      .onConflictDoNothing()
      .run();

    // 6. run stubs — one per Pokémon incl. MissingNo (status starts untouched)
    const allDex = [MISSINGNO.dex, ...cache.pokemonDetails.map((p) => p.id)];
    tx.insert(runs)
      .values(allDex.map((dex) => ({ pokemonDex: dex, attemptNo: 1, status: "untouched" as const })))
      .onConflictDoNothing()
      .run();

    return {
      categories: CATEGORIES.length,
      pokemon: pokemonRows.length + 1,
      moves: moveRows.length,
      learnset: learnsetRows.length,
      gyms: GYMS.length,
      runs: allDex.length,
    };
  });
}
