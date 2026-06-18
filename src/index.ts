/**
 * Hono entry point.
 *   Phase 1A: /health skeleton.
 *   Phase 1C: session middleware + account routes + a logged-in landing.
 * The 151-grid spine shell replaces the landing in Phase 1D.
 */
import { Hono } from "hono";

import { type AppEnv, sessionContext } from "./auth/middleware";
import { authRoutes } from "./routes/auth.tsx";
import { homeRoutes } from "./routes/home.tsx";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Resolve the current user for every request below.
app.use("*", sessionContext);

app.route("/", authRoutes);
app.route("/", homeRoutes);

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
