/**
 * Seed entry point: `bun run db:seed`.
 *   1B-1 (always): offline reference seed from the PokéAPI cache.
 *   content (always): curated Events catalog.
 *   1B-2 (if YOUTUBE_API_KEY + YOUTUBE_PLAYLIST_ID set): videos + run links.
 */
import { db, sqlite } from "../client";
import { seedContent } from "./content";
import { seedReference } from "./reference";
import { seedYoutube } from "./youtube";

const ref = seedReference(db);
console.log("✓ reference seed:", ref);

const content = seedContent(db);
console.log(`✓ content seed: ${content.events} events`);

if (process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_PLAYLIST_ID) {
  const yt = await seedYoutube(db);
  console.log(`✓ youtube seed: ${yt.videosInserted} videos, ${yt.runLinks} run links`);
  if (yt.unmatched.length) {
    console.log(`  ${yt.unmatched.length} unmatched titles:`);
    yt.unmatched.forEach((t) => console.log(`    - ${t}`));
  }
} else {
  console.log("• youtube seed skipped (set YOUTUBE_API_KEY + YOUTUBE_PLAYLIST_ID to run 1B-2)");
}

sqlite.close();
