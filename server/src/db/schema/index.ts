/**
 * Schema barrel. Drizzle-kit and the runtime client both read from here.
 * Core first, then domain — re-exported flat so `db.query.*` sees every table.
 */
export * from "./core";
export * from "./domain";
