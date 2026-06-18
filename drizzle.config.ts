import { defineConfig } from "drizzle-kit";

// Drizzle-kit reads the TS schema (the source of truth, translated from
// gobrain schema.md) and emits SQLite migrations into ./migrations.
// For incompatible ALTERs (CHECK / FK / UNIQUE) drizzle-kit emits the full
// SQLite table rebuild-and-copy — covering the roadmap [OPS] requirement.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/app.db",
  },
  strict: true,
  verbose: true,
});
