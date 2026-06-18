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
