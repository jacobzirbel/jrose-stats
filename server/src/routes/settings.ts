/**
 * User settings API (per-user key/value, JSON-encoded values). Generic — the
 * server doesn't know the setting vocabulary; the client owns keys + defaults.
 *   GET /api/settings        the caller's settings as a flat object
 *   PUT /api/settings        upsert a partial object (each key its own row)
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { type AppEnv, requireAuth } from "../auth/middleware";
import { db } from "../db/client";
import { userSettings } from "../db/schema";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/settings", requireAuth, (c) => {
  const user = c.get("user")!;
  const rows = db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .all();

  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return c.json(out);
});

settingsRoutes.put("/settings", requireAuth, async (c) => {
  const user = c.get("user")!;
  const patch = await c.req.json().catch(() => null);
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return c.json({ error: "Body must be a settings object." }, 400);
  }

  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const json = JSON.stringify(value);
    db.insert(userSettings)
      .values({ userId: user.id, key, value: json })
      .onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value: json } })
      .run();
  }
  return c.body(null, 204);
});
