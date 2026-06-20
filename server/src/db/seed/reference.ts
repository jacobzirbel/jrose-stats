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
import { BATTLES, CATEGORIES, GEN1_VERSION_GROUPS, MISSINGNO } from "./static-data";

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
  battles: number;
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
    const battlesCat = catBySlug.get("battles")!;

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

    // 5. battles → catalog_items bridge + gyms lookup (gym battles only) ----
    // All 21 major battles are catalog_items in the Battles category, in
    // canonical sequence (sort_order). The gym subset also bridges to the domain
    // `gyms` table — the gym flag that survives the merge.
    tx.insert(catalogItems)
      .values(
        BATTLES.map((b, i) => ({
          categoryId: battlesCat,
          slug: b.slug,
          label: b.label,
          status: "active" as const,
          sortOrder: i,
        })),
      )
      .onConflictDoNothing()
      .run();
    const battleCatItems = tx
      .select({ id: catalogItems.id, slug: catalogItems.slug })
      .from(catalogItems)
      .where(eq(catalogItems.categoryId, battlesCat))
      .all();
    const battleCatBySlug = new Map(battleCatItems.map((r) => [r.slug, r.id]));
    const gymBattles = BATTLES.filter((b) => b.gym);
    tx.insert(gyms)
      .values(
        gymBattles.map((b) => ({
          catalogItemId: battleCatBySlug.get(b.slug)!,
          leader: b.gym!.leader,
          city: b.gym!.city,
          canonicalOrder: b.gym!.order,
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
      battles: BATTLES.length,
      gyms: gymBattles.length,
      runs: allDex.length,
    };
  });
}
