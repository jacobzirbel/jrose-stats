/**
 * Static seed data the domain defines: the category config (core's shape,
 * domain's rows) and the combined, ordered Battles list (gyms + rivals +
 * Giovanni fights + Elite Four + Champion), with the 8 gyms flagged.
 */

// Moves m/required0/ts0; Battles b/required1/ts1 (gyms folded in — order matters);
// Events e/required0/ts1 (notable moments; jokes folded into Events, JZ).
export const CATEGORIES = [
  { slug: "moves", label: "Moves", keybind: "m", required: 0, timestampLoadBearing: 0, sortOrder: 0 },
  { slug: "battles", label: "Battles", keybind: "b", required: 1, timestampLoadBearing: 1, sortOrder: 1 },
  { slug: "events", label: "Events", keybind: "e", required: 0, timestampLoadBearing: 1, sortOrder: 2 },
] as const;

// Curated content catalog_items, seeded as `active` (community proposals come
// later as `proposed`). Labels are JZ's; verify wording/spelling. Includes the
// former "jokes" (Erika gags, etc.) now living under Events.
export interface EventSeed {
  slug: string;
  label: string;
  // Pins position in the Events picker; the list sorts by (sortOrder, label).
  // Omit for the default 0 = alphabetical bucket; negative floats to the top.
  sortOrder?: number;
}

export const EVENTS: EventSeed[] = [
  // Pinned to the top: the run-intro naming moments (carry a `name` text field).
  { slug: "picked-rival", label: "Picked rival pokemon", sortOrder: -3 },
  { slug: "named-poke", label: "Named ", sortOrder: -2 },
  { slug: "named-self", label: "Named self", sortOrder: -2 },
  { slug: "named-rival", label: "Named rival", sortOrder: -1 },
  { slug: "restarts-run", label: "Restarts the run" },
  { slug: "e4-badge-boost-glitch-strat", label: "E4 badge boost glitch strat" },
  { slug: "forgot-erika", label: "Forgot Erika" },
  { slug: "didnt-forget-erika", label: "Mentioned he didn't forget Erika" },
  { slug: "badge-boost-glitch-explained", label: "Badge boost glitch explained" },
  { slug: "no-healing-spot-ss-anne", label: "No healing spot on S.S. Anne" },
  { slug: "count-impression", label: "Count impression" },
  { slug: "lora-lee", label: "Lora-lee" },
  { slug: "lora-lay", label: "Lora-lay" },
  { slug: "lora-lie", label: "Lora-lie" },
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
  // The picker's choices for type='enum' (serialized to category_fields.options
  // as JSON); omit for every other type. The stored claim value is the `value`.
  options?: { value: string; label: string }[];
  // Validation-required: if a claim on this scope exists, the field must hold a
  // value (ClaimFieldsValidator → `claim-field-missing`). Default 0 (optional).
  required?: boolean;
  // Identity-bearing: the field's value is part of the fact's key (see
  // category_fields.isIdentity). Used by the copy mechanics so one mechanic can
  // capture a SET of moves (Mimic copying Tackle AND Growl = two facts).
  identity?: boolean;
}

export const CATEGORY_FIELDS: CategoryFieldSeed[] = [
  // Copy mechanics: the CLAIM is the mechanic move (mimic / mirror-move /
  // metronome — all in-learnset); the field records the move it produced,
  // picked from ALL moves (NOT the run learnset). One row per mechanic item.
  // `identity` so each copied move is its own fact (set-valued, not one value).
  { category: "moves", item: "mimic", slug: "copied-move", label: "Mimicked move", type: "catalog_ref", refCategory: "moves", identity: true },
  { category: "moves", item: "mirror-move", slug: "copied-move", label: "Mirrored move", type: "catalog_ref", refCategory: "moves", identity: true },
  { category: "moves", item: "metronome", slug: "copied-move", label: "Metronome result", type: "catalog_ref", refCategory: "moves", identity: true },
  // Every battle records the solo Pokémon's level and the in-game time reached.
  // Category-wide (no `item`) so they apply to all battles. Value fields (not
  // identity): a single-source value reads as unconfirmed until both logs match.
  // `time` is stored as seconds; the workbench accepts M:SS and parses it.
  { category: "battles", slug: "level", label: "Level (after battle)", type: "number" },
  { category: "battles", slug: "time", label: "In-game time (after battle, 0 if unknown)", type: "duration" },
  // Free-text capture when JZ logs "Badge boost glitch explained". Plain text for
  // now (item-scoped to that one event); the multi-choice sentiment — defensive /
  // didn't-know-during-run / throwaway — gets derived from this text later.
  { category: "events", item: "badge-boost-glitch-explained", slug: "sentiment", label: "Sentiment", type: "text" },
  // The names chosen at the run intro — one text field per event. Required: if you
  // log the naming, you must record the name (can't submit a blank "Named self").
  { category: "events", item: "named-poke", slug: "name", label: "Name", type: "text", required: true },
  { category: "events", item: "named-self", slug: "name", label: "Name", type: "text", required: true },
  { category: "events", item: "named-rival", slug: "name", label: "Name", type: "text", required: true },
  // Which starter the rival picked — always one of the three Gen-1 starters, so a
  // single-select enum picker rather than free text.
  {
    category: "events",
    item: "picked-rival",
    slug: "pokemon",
    label: "Pokémon",
    type: "enum",
    options: [
      { value: "bulbasaur", label: "Bulbasaur" },
      { value: "charmander", label: "Charmander" },
      { value: "squirtle", label: "Squirtle" },
    ],
  },
];

// The combined, ordered major-battle list: gyms, rival fights, the two Giovanni
// (Rocket) fights, the Elite Four, and the Champion. Order here is the canonical
// run sequence (used as catalog sort order); a run's ACTUAL order is logged
// per-video (ordinal). A battle with `gym` metadata is a gym fight — it seeds the
// domain `gyms` table (leader/city/canonical 1..8 badge order), which is how the
// gym "flag" survives the merge while CORE stays gym-blind.
export interface BattleSeed {
  slug: string;
  label: string;
  gym?: { leader: string; city: string; order: number };
}

export const BATTLES: BattleSeed[] = [
  { slug: "rival-1", label: "Rival 1" },
  // Optional extra rival fight — NOT a gym, so not required by GymCompletenessValidator.
  { slug: "rival-1a", label: "Rival 1A" },
  { slug: "gym-brock", label: "Brock — Pewter Gym", gym: { leader: "Brock", city: "Pewter City", order: 1 } },
  { slug: "rival-2", label: "Rival 2" },
  { slug: "gym-misty", label: "Misty — Cerulean Gym", gym: { leader: "Misty", city: "Cerulean City", order: 2 } },
  { slug: "rival-3", label: "Rival 3" },
  { slug: "gym-lt-surge", label: "Lt. Surge — Vermilion Gym", gym: { leader: "Lt. Surge", city: "Vermilion City", order: 3 } },
  { slug: "gym-erika", label: "Erika — Celadon Gym", gym: { leader: "Erika", city: "Celadon City", order: 4 } },
  { slug: "giovanni-1", label: "Giovanni 1" },
  { slug: "rival-4", label: "Rival 4" },
  { slug: "rival-fival", label: "Rival Fival" },
  { slug: "gym-koga", label: "Koga — Fuchsia Gym", gym: { leader: "Koga", city: "Fuchsia City", order: 5 } },
  { slug: "giovanni-2", label: "Giovanni 2" },
  { slug: "gym-sabrina", label: "Sabrina — Saffron Gym", gym: { leader: "Sabrina", city: "Saffron City", order: 6 } },
  { slug: "gym-blaine", label: "Blaine — Cinnabar Gym", gym: { leader: "Blaine", city: "Cinnabar Island", order: 7 } },
  { slug: "gym-giovanni", label: "Giovanni — Viridian Gym", gym: { leader: "Giovanni", city: "Viridian City", order: 8 } },
  { slug: "rival-6", label: "Rival 6" },
  { slug: "e4-lorelei", label: "Lorelei" },
  { slug: "e4-bruno", label: "Bruno" },
  { slug: "e4-agatha", label: "Agatha" },
  { slug: "e4-lance", label: "Lance" },
  { slug: "champion", label: "Champion" },
];

// Moves PokéAPI omits from learnsets because they're universally usable, not
// learned — the no-PP fallback. Seeded as real moves (so claims/stats treat them
// like any move) but EXEMPT from the learnset check (see LearnsetValidator).
// PokéAPI ids continue the move sequence (Struggle = 165).
export const UNIVERSAL_MOVES = [
  { id: 165, name: "struggle", category: "physical" },
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
