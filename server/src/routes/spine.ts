/**
 * Spine API (Phase 1D, JSON): the public 151-grid + per-pokemon detail. Read
 * only and ungated — anyone may view; logging (1E) is what needs an account.
 */
import { Hono } from "hono";

import type { AppEnv } from "../auth/middleware";
import { db } from "../db/client";
import { getPokemonDetail, getSpine } from "../db/queries/spine";

export const spineRoutes = new Hono<AppEnv>();

spineRoutes.get("/spine", (c) => {
  const sort = c.req.query("sort") === "playlist" ? "playlist" : "dex";
  return c.json({ sort, cells: getSpine(db, sort) });
});

spineRoutes.get("/pokemon/:dex", (c) => {
  const dex = Number(c.req.param("dex"));
  const detail = Number.isInteger(dex) ? getPokemonDetail(db, dex) : null;
  if (!detail) return c.json({ error: "Not found" }, 404);
  return c.json(detail);
});
