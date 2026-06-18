/**
 * Static seed data the domain defines: the category config (core's shape,
 * domain's rows) and the 8 Kanto gyms in canonical order.
 */

// roadmap §1B: Moves m/required0/ts0, Gyms g/required1/ts1,
//              Jokes j/required0/ts1, Battles b/required0/ts1
// Events (session 13): non-joke notable moments (e.g. restarts, glitch strats).
export const CATEGORIES = [
  { slug: "moves", label: "Moves", keybind: "m", required: 0, timestampLoadBearing: 0, sortOrder: 0 },
  { slug: "gyms", label: "Gyms", keybind: "g", required: 1, timestampLoadBearing: 1, sortOrder: 1 },
  { slug: "jokes", label: "Jokes", keybind: "j", required: 0, timestampLoadBearing: 1, sortOrder: 2 },
  { slug: "battles", label: "Battles", keybind: "b", required: 0, timestampLoadBearing: 1, sortOrder: 3 },
  { slug: "events", label: "Events", keybind: "e", required: 0, timestampLoadBearing: 1, sortOrder: 4 },
] as const;

// Curated content catalog_items, seeded as `active` (community proposals come
// later as `proposed`). Labels are JZ's; verify wording/spelling.
export const JOKES = [
  { slug: "forgot-erika", label: "Forgot Erika" },
  { slug: "didnt-forget-erika", label: "Mentioned he didn't forget Erika" },
  { slug: "badge-boost-glitch-explained", label: "Badge boost glitch explained" },
  { slug: "no-healing-spot-ss-anne", label: "No healing spot on S.S. Anne" },
  { slug: "count-impression", label: "Count impression" },
] as const;

export const EVENTS = [
  { slug: "restarts-run", label: "Restarts the run" },
  { slug: "e4-badge-boost-glitch-strat", label: "E4 badge boost glitch strat" },
] as const;

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
