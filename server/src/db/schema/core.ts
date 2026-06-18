/**
 * CORE schema — the generic video-logging engine.
 *
 * Translated from gobrain `schema.md` › "DDL — CORE". Knows NOTHING about
 * Pokémon: no moves, no gyms, no run-status. Everything-is-a-catalog-item;
 * a claim points only at a catalog_item and reaches its category by join.
 *
 * One-way dependency rule: this file imports nothing from ./domain. Core must
 * compile and migrate with the domain layer deleted.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// --- platform / auth (generic) ---------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"),
    points: integer("points").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [check("users_role_chk", sql`${t.role} IN ('member','editor','admin')`)],
);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});

// Per-user preferences as a generic key/value store. `value` is JSON-encoded
// text so any type round-trips; the app owns the key vocabulary + defaults.
export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// --- generic video identity (NO pokemon_dex, NO run-status: those are domain) ---
export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey(),
  title: text("title"),
  url: text("url"),
  youtubeId: text("youtube_id"),
  playlistPos: integer("playlist_pos"),
  publishedAt: text("published_at"),
  durationSec: real("duration_sec"), // input to the timestamp bounds-check
});

// --- category config (core defines the shape; domain SEEDS the rows) --------
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(), // 'moves','gyms','jokes','battles'
  label: text("label").notNull(),
  keybind: text("keybind"), // single key, user-rebindable, nullable
  icon: text("icon"),
  required: integer("required").notNull().default(0), // mandatory-for-complete-log
  timestampLoadBearing: integer("timestamp_load_bearing").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

// --- the vocabulary; everything-is-a-catalog-item --------------------------
export const catalogItems = sqliteTable(
  "catalog_items",
  {
    id: integer("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    status: text("status").notNull().default("proposed"),
  },
  (t) => [
    unique("catalog_items_category_slug_uq").on(t.categoryId, t.slug),
    check(
      "catalog_items_status_chk",
      sql`${t.status} IN ('proposed','active','retired')`,
    ),
  ],
);

// --- contribution layer (generic) ------------------------------------------
export const videoLogs = sqliteTable(
  "video_logs", // one working doc per (user, video)
  {
    id: integer("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    submittedAt: text("submitted_at"),
    deletedAt: text("deleted_at"), // soft-delete; orthogonal to status
  },
  (t) => [
    // Partial unique: one LIVE doc per (user, video). Soft-deleted rows are
    // retained (audit / consensus) and don't block starting a fresh log.
    uniqueIndex("video_logs_user_video_uq")
      .on(t.userId, t.videoId)
      .where(sql`${t.deletedAt} IS NULL`),
    check("video_logs_status_chk", sql`${t.status} IN ('draft','submitted')`),
  ],
);

export const coverageSpans = sqliteTable(
  "coverage_spans", // watched intervals; resume aid ONLY, not claim units
  {
    id: integer("id").primaryKey(),
    logId: integer("log_id")
      .notNull()
      .references(() => videoLogs.id, { onDelete: "cascade" }),
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
  },
  (t) => [check("coverage_spans_order_chk", sql`${t.endSec} > ${t.startSec}`)],
);

// THE atom: one timestamped claim per row, pointing ONLY at a catalog_item.
// No event_type, no move_id/gym_id. Category reached by join through catalog_items.
export const eventClaims = sqliteTable(
  "event_claims",
  {
    id: integer("id").primaryKey(),
    logId: integer("log_id")
      .notNull()
      .references(() => videoLogs.id, { onDelete: "cascade" }),
    catalogItemId: integer("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id),
    timestampSec: real("timestamp_sec").notNull(),
    note: text("note"), // HUMAN annotation only; never structured data
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("ix_claims_log").on(t.logId),
    index("ix_claims_catalog").on(t.catalogItemId),
  ],
);

// --- per-claim structured metadata (queryable; NOT a JSON blob) -------------
// Config: extra typed fields a claim MAY carry. Scope (`catalog_item_id`):
//   NULL → every claim in the category; set → only claims on that one item.
// Examples seeded today: a `copied-move` field on the mimic/mirror-move/
// metronome items (claim = the mechanic, field = the move it produced), and an
// `ingame-time` field on the Brock gym item only.
export const categoryFields = sqliteTable(
  "category_fields",
  {
    id: integer("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    catalogItemId: integer("catalog_item_id").references(() => catalogItems.id),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull().default("text"),
    // type='catalog_ref' only: the category the picked item is drawn from (e.g.
    // moves). Keeps "pick any move" in CORE terms — a category id, never a
    // domain table — so the generic field UI needs no Pokémon knowledge.
    refCategoryId: integer("ref_category_id").references(() => categories.id),
    // JSON array of {value,label} for type='enum'; NULL for other types.
    options: text("options"),
    required: integer("required").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    // slug unique per scope. Two partial indexes instead of one coalesce
    // expression: drizzle-kit can't render a SQL expression inside .on(), but
    // partial .where() predicates emit verbatim (cf. video_logs_user_video_uq).
    // Item-scoped: slug unique within (category, item) — so mimic/mirror-move/
    // metronome can all carry their own `copied-move`.
    uniqueIndex("category_fields_item_slug_uq")
      .on(t.categoryId, t.catalogItemId, t.slug)
      .where(sql`${t.catalogItemId} IS NOT NULL`),
    // Category-wide: slug unique within the category (NULL item).
    uniqueIndex("category_fields_cat_slug_uq")
      .on(t.categoryId, t.slug)
      .where(sql`${t.catalogItemId} IS NULL`),
    check(
      "category_fields_type_chk",
      sql`${t.type} IN ('text','number','duration','enum','catalog_ref')`,
    ),
  ],
);

// Values: one typed value per (claim, field). The claim atom stays unstructured
// (event_claims.note is human-only); every structured fact lives here as its own
// row — one column per value, never a blob — so it stays queryable. Exactly one
// of value / value_catalog_item_id is populated per the field's type (enforced
// by the validation layer, since a CHECK can't reach category_fields.type).
export const claimFields = sqliteTable(
  "claim_fields",
  {
    id: integer("id").primaryKey(),
    claimId: integer("claim_id")
      .notNull()
      .references(() => eventClaims.id, { onDelete: "cascade" }),
    fieldId: integer("field_id")
      .notNull()
      .references(() => categoryFields.id),
    // Scalar value (text/number/duration/enum); NULL when the field is catalog_ref.
    value: text("value"),
    // Reference value for type='catalog_ref' (e.g. the copied move) — a real FK,
    // so the copied move stays a first-class catalog_item, not a stringified id.
    valueCatalogItemId: integer("value_catalog_item_id").references(
      () => catalogItems.id,
    ),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [unique("claim_fields_claim_field_uq").on(t.claimId, t.fieldId)],
);
