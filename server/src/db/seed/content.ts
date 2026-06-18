/**
 * Content seed: the curated Jokes + Events catalog (`status='active'`). Runs
 * after the reference seed (which creates the categories). Idempotent via
 * onConflictDoNothing — re-run freely, and add to JOKES/EVENTS over time.
 *
 * Unlike PokéAPI reference data, this is hand-curated series content; the crowd
 * later adds more via inline-propose (those land as `status='proposed'`).
 */
import { eq } from "drizzle-orm";

import type { DB } from "../client";
import { catalogItems, categories } from "../schema";
import { EVENTS } from "./static-data";

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
