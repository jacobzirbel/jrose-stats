/**
 * Admin API — user management + the human-resolution task queue. Every route is
 * gated by `requireAdmin`; the actual resolution of a queue item happens on the
 * existing /run/:runId page (certify/overturn, accept/reject), so the queue here
 * only surfaces work + deep-links to it.
 *
 *   GET   /api/admin/users            list every account (no hashes)
 *   PATCH /api/admin/users/:id/role   change a role (can't demote the last admin)
 *   GET   /api/admin/queue            escalated runs + contested facts + pending proposals
 */
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { type AppEnv, requireAdmin } from "../auth/middleware";
import { isRole } from "../auth/roles";
import { db } from "../db/client";
import {
  countAdmins,
  getAdminQueue,
  getUserRole,
  getUsers,
} from "../db/queries/admin";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/admin/users", requireAdmin, (c) => {
  return c.json({ users: getUsers(db) });
});

adminRoutes.patch("/admin/users/:id/role", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const role = body.role;
  if (!Number.isInteger(id) || !isRole(role)) {
    return c.json({ error: "A valid user id and role (member|trusted|admin) are required." }, 400);
  }

  // Read the role, check the last-admin guard, and write in ONE transaction so
  // the count-then-update can't race a concurrent role change.
  const outcome = db.transaction((tx): { code: 200 } | { code: 404 | 409; error: string } => {
    const current = getUserRole(tx, id);
    if (current == null) return { code: 404, error: "User not found" };
    // Guard against locking everyone out: the last admin can't be demoted.
    if (current === "admin" && role !== "admin" && countAdmins(tx) <= 1) {
      return { code: 409, error: "Can't demote the only admin." };
    }
    tx.run(sql`UPDATE users SET role = ${role} WHERE id = ${id}`);
    return { code: 200 };
  });

  if (outcome.code !== 200) return c.json({ error: outcome.error }, outcome.code);
  return c.json({ ok: true, id, role });
});

adminRoutes.get("/admin/queue", requireAdmin, (c) => {
  return c.json(getAdminQueue(db));
});
