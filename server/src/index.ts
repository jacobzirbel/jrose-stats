/**
 * Hono entry point — JSON API for the Angular client (served separately by
 * `ng serve` in dev, proxied under /api).
 *   Phase 1C: session middleware + account routes.
 *   Phase 1D: public spine + per-pokemon detail.
 */
import { Hono } from "hono";

import { type AppEnv, sessionContext } from "./auth/middleware";
import { authRoutes } from "./routes/auth";
import { spineRoutes } from "./routes/spine";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Resolve the current user for every API request.
app.use("/api/*", sessionContext);

const api = new Hono<AppEnv>();
api.route("/", authRoutes);
api.route("/", spineRoutes);
app.route("/api", api);

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
