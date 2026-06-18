/**
 * Hono entry point. Phase 1A: just-enough skeleton to prove the scaffold runs.
 * Real routes (spine grid, workbench, auth) land in 1C–1E.
 */
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
