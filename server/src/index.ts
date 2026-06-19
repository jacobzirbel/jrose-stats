/**
 * Hono entry point — JSON API for the Angular client (served separately by
 * `ng serve` in dev, proxied under /api).
 *   Phase 1C: session middleware + account routes.
 *   Phase 1D: public spine + per-pokemon detail.
 *   Phase 1E: workbench (catalog + draft logs + claims).
 */
import { Hono } from "hono";

import { type AppEnv, sessionContext } from "./auth/middleware";
import { authRoutes } from "./routes/auth";
import { canonicalRoutes } from "./routes/canonical";
import { reconcileRoutes } from "./routes/reconcile";
import { reviewRoutes } from "./routes/review";
import { settingsRoutes } from "./routes/settings";
import { spineRoutes } from "./routes/spine";
import { workbenchRoutes } from "./routes/workbench";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Resolve the current user for every API request.
app.use("/api/*", sessionContext);

const api = new Hono<AppEnv>();
api.route("/", authRoutes);
api.route("/", spineRoutes);
api.route("/", workbenchRoutes);
api.route("/", settingsRoutes);
api.route("/", canonicalRoutes);
api.route("/", reconcileRoutes);
api.route("/", reviewRoutes);
app.route("/api", api);

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
