/**
 * Content seed: the curated Jokes + Events catalog (`status='active'`). Runs
 * after the reference seed (which creates the categories). Idempotent via
 * onConflictDoNothing — re-run freely, and add to JOKES/EVENTS over time.
 *
 * Unlike PokéAPI reference data, this is hand-curated series content; the crowd
 * later adds more via inline-propose (those land as `status='proposed'`).
 */
import type { DB } from "../client";
import { catalogItems, categories } from "../schema";
import { EVENTS, JOKES } from "./static-data";

export interface ContentCounts {
  jokes: number;
  events: number;
}

export function seedContent(db: DB): ContentCounts {
  return db.transaction((tx): ContentCounts => {
    const catBySlug = new Map(
      tx.select({ id: categories.id, slug: categories.slug }).from(categories).all().map((c) => [c.slug, c.id]),
    );
    const jokesCat = catBySlug.get("jokes");
    const eventsCat = catBySlug.get("events");
    if (jokesCat == null || eventsCat == null) {
      throw new Error("seedContent: jokes/events categories missing — run the reference seed first.");
    }

    tx.insert(catalogItems)
      .values(JOKES.map((j) => ({ categoryId: jokesCat, slug: j.slug, label: j.label, status: "active" as const })))
      .onConflictDoNothing()
      .run();
    tx.insert(catalogItems)
      .values(EVENTS.map((e) => ({ categoryId: eventsCat, slug: e.slug, label: e.label, status: "active" as const })))
      .onConflictDoNothing()
      .run();

    return { jokes: JOKES.length, events: EVENTS.length };
  });
}
