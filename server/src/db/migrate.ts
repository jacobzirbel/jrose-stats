/**
 * Apply pending migrations from ./migrations to DATABASE_URL.
 * Run after `bun run db:generate`. Idempotent — drizzle tracks applied hashes.
 */
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: "./migrations" });
sqlite.close();
console.log("migrations applied");
