/**
 * Content seed: the curated Jokes + Events catalog (`status='active'`). Runs
 * after the reference seed (which creates the categories). Idempotent via
 * onConflictDoNothing — re-run freely, and add to JOKES/EVENTS over time.
 *
 * Unlike PokéAPI reference data, this is hand-curated series content; the crowd
 * later adds more via inline-propose (those land as `status='proposed'`).
 */
import { and, eq } from "drizzle-orm";

import type { DB } from "../client";
import { catalogItems, categories, categoryFields } from "../schema";
import { CATEGORY_FIELDS, EVENTS } from "./static-data";

export interface ContentCounts {
  events: number;
}

export function seedContent(db: DB): ContentCounts {
  return db.transaction((tx): ContentCounts => {
    const eventsCat = tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "events"))
      .get();
    if (!eventsCat) {
      throw new Error("seedContent: events category missing — run the reference seed first.");
    }

    tx.insert(catalogItems)
      .values(EVENTS.map((e) => ({ categoryId: eventsCat.id, slug: e.slug, label: e.label, status: "active" as const })))
      .onConflictDoNothing()
      .run();

    return { events: EVENTS.length };
  });
}

/**
 * Seeds the per-claim metadata field config (core's category_fields) from
 * CATEGORY_FIELDS, resolving category/item/ref slugs to ids. Runs after the
 * reference seed (categories + the mimic/gym catalog_items must exist).
 * Idempotent via onConflictDoNothing on the (category, item, slug) unique index.
 */
export function seedCategoryFields(db: DB): number {
  return db.transaction((tx): number => {
    const catBySlug = new Map(
      tx.select({ id: categories.id, slug: categories.slug }).from(categories).all().map((c) => [c.slug, c.id] as const),
    );

    const rows = CATEGORY_FIELDS.map((f) => {
      const categoryId = catBySlug.get(f.category);
      if (categoryId == null) {
        throw new Error(`seedCategoryFields: category '${f.category}' missing — run the reference seed first.`);
      }

      let refCategoryId: number | null = null;
      if (f.refCategory) {
        refCategoryId = catBySlug.get(f.refCategory) ?? null;
        if (refCategoryId == null) throw new Error(`seedCategoryFields: refCategory '${f.refCategory}' missing.`);
      }

      let catalogItemId: number | null = null;
      if (f.item) {
        const item = tx
          .select({ id: catalogItems.id })
          .from(catalogItems)
          .where(and(eq(catalogItems.categoryId, categoryId), eq(catalogItems.slug, f.item)))
          .get();
        if (!item) throw new Error(`seedCategoryFields: item '${f.item}' missing in category '${f.category}'.`);
        catalogItemId = item.id;
      }

      return { categoryId, catalogItemId, slug: f.slug, label: f.label, type: f.type, refCategoryId };
    });

    tx.insert(categoryFields).values(rows).onConflictDoNothing().run();
    return rows.length;
  });
}
