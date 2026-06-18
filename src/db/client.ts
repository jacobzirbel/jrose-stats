/**
 * Database client. One bun:sqlite connection, WAL + foreign_keys enforced.
 *
 * `PRAGMA foreign_keys = ON` is PER-CONNECTION and OFF by default — with it
 * off, FK clauses silently no-op (a validated gotcha). bun:sqlite uses a
 * single connection per Database, so setting it once at open time holds.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";

export function openDatabase(url: string): Database {
  // bun:sqlite creates the file but not its parent dir. Skip for :memory:.
  if (url !== ":memory:" && url.includes("/")) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return sqlite;
}

const DATABASE_URL = process.env.DATABASE_URL ?? "./data/app.db";

export const sqlite = openDatabase(DATABASE_URL);
export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
