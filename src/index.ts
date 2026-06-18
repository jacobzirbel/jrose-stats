/**
 * Hono entry point.
 *   Phase 1A: /health skeleton.
 *   Phase 1C: session middleware + account routes.
 *   Phase 1D: public 151-grid spine + per-pokemon detail at `/`.
 */
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import { type AppEnv, sessionContext } from "./auth/middleware";
import { authRoutes } from "./routes/auth.tsx";
import { spineRoutes } from "./routes/spine.tsx";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));

// Static assets (CSS, etc.) from ./public, served under /static/.
app.use("/static/*", serveStatic({ root: "./public", rewriteRequestPath: (p) => p.slice("/static".length) }));

// Resolve the current user for every request below.
app.use("*", sessionContext);

app.route("/", authRoutes);
app.route("/", spineRoutes);

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
