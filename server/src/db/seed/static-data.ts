/**
 * Static seed data the domain defines: the category config (core's shape,
 * domain's rows) and the 8 Kanto gyms in canonical order.
 */

// roadmap §1B: Moves m/required0/ts0, Gyms g/required1/ts1, Battles b/required0/ts1.
// Events (session 13): notable moments. Jokes were folded into Events (JZ).
export const CATEGORIES = [
  { slug: "moves", label: "Moves", keybind: "m", required: 0, timestampLoadBearing: 0, sortOrder: 0 },
  { slug: "gyms", label: "Gyms", keybind: "g", required: 1, timestampLoadBearing: 1, sortOrder: 1 },
  { slug: "battles", label: "Battles", keybind: "b", required: 0, timestampLoadBearing: 1, sortOrder: 2 },
  { slug: "events", label: "Events", keybind: "e", required: 0, timestampLoadBearing: 1, sortOrder: 3 },
] as const;

// Curated content catalog_items, seeded as `active` (community proposals come
// later as `proposed`). Labels are JZ's; verify wording/spelling. Includes the
// former "jokes" (Erika gags, etc.) now living under Events.
export const EVENTS = [
  { slug: "restarts-run", label: "Restarts the run" },
  { slug: "e4-badge-boost-glitch-strat", label: "E4 badge boost glitch strat" },
  { slug: "forgot-erika", label: "Forgot Erika" },
  { slug: "didnt-forget-erika", label: "Mentioned he didn't forget Erika" },
  { slug: "badge-boost-glitch-explained", label: "Badge boost glitch explained" },
  { slug: "no-healing-spot-ss-anne", label: "No healing spot on S.S. Anne" },
  { slug: "count-impression", label: "Count impression" },
] as const;

// Per-claim metadata field config (core's category_fields). Each entry is one
// typed field a claim may carry. `item` scopes it to a single catalog item
// (omit = whole category); `refCategory` is the catalog a type='catalog_ref'
// picker draws from. Resolved to ids by `seedCategoryFields` (slugs → ids).
export interface CategoryFieldSeed {
  category: string;
  item?: string;
  slug: string;
  label: string;
  type: "text" | "number" | "duration" | "enum" | "catalog_ref";
  refCategory?: string;
}

export const CATEGORY_FIELDS: CategoryFieldSeed[] = [
  // Copy mechanics: the CLAIM is the mechanic move (mimic / mirror-move /
  // metronome — all in-learnset); the field records the move it produced,
  // picked from ALL moves (NOT the run learnset). One row per mechanic item.
  { category: "moves", item: "mimic", slug: "copied-move", label: "Mimicked move", type: "catalog_ref", refCategory: "moves" },
  { category: "moves", item: "mirror-move", slug: "copied-move", label: "Mirrored move", type: "catalog_ref", refCategory: "moves" },
  { category: "moves", item: "metronome", slug: "copied-move", label: "Metronome result", type: "catalog_ref", refCategory: "moves" },
  // In-game time to clear Brock — shows on the Brock gym claim only. Stored as
  // seconds; the workbench accepts M:SS and parses it.
  { category: "gyms", item: "gym-brock", slug: "ingame-time", label: "In-game time (after beating Brock, 0 if unknown)", type: "duration" },
];

export const GYMS = [
  { order: 1, leader: "Brock", city: "Pewter City", slug: "gym-brock", label: "Brock — Pewter Gym" },
  { order: 2, leader: "Misty", city: "Cerulean City", slug: "gym-misty", label: "Misty — Cerulean Gym" },
  { order: 3, leader: "Lt. Surge", city: "Vermilion City", slug: "gym-lt-surge", label: "Lt. Surge — Vermilion Gym" },
  { order: 4, leader: "Erika", city: "Celadon City", slug: "gym-erika", label: "Erika — Celadon Gym" },
  { order: 5, leader: "Koga", city: "Fuchsia City", slug: "gym-koga", label: "Koga — Fuchsia Gym" },
  { order: 6, leader: "Sabrina", city: "Saffron City", slug: "gym-sabrina", label: "Sabrina — Saffron Gym" },
  { order: 7, leader: "Blaine", city: "Cinnabar Island", slug: "gym-blaine", label: "Blaine — Cinnabar Gym" },
  { order: 8, leader: "Giovanni", city: "Viridian City", slug: "gym-giovanni", label: "Giovanni — Viridian Gym" },
] as const;

// MissingNo. — dex 0, the glitch.
export const MISSINGNO = {
  dex: 0,
  name: "missingno",
  isGlitch: 1,
  type1: "bird",
  type2: "normal",
} as const;

export const GEN1_VERSION_GROUPS = new Set(["red-blue", "yellow"]);
