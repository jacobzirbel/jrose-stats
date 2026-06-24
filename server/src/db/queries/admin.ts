/**
 * Read queries backing the admin surface (user management + the human-resolution
 * task queue). Admin-only — the route gates with `requireAdmin`; these just read.
 *
 * The queue has three buckets, each carrying a `runId` so the client deep-links
 * to /run/:runId, where the existing admin controls (certify/overturn, accept/
 * reject) resolve the item. Run attribution reuses the COALESCE(claim_run,
 * sole-run-of-video) pattern shared with review.ts / canonical.
 */
import { sql } from "drizzle-orm";

import type { DB } from "../client";
import { attributedRunId } from "../run-attribution";

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  points: number;
  createdAt: string;
}

export interface EscalatedRun {
  runId: number;
  pokemonDex: number;
  pokemonName: string;
}

export interface ContestedFact {
  runId: number;
  pokemonName: string;
  label: string;
  category: string;
  timestampSec: number;
}

export interface PendingProposal {
  id: number;
  runId: number;
  pokemonName: string;
  label: string;
  proposedBy: string;
  note: string | null;
  timestampSec: number;
  createdAt: string;
}

export interface AdminQueue {
  escalatedRuns: EscalatedRun[];
  contestedFacts: ContestedFact[];
  pendingProposals: PendingProposal[];
}

// member -> trusted -> admin, mirroring auth/roles.ROLE_RANK (highest first).
const ROLE_ORDER = sql`CASE role WHEN 'admin' THEN 0 WHEN 'trusted' THEN 1 ELSE 2 END`;

/** All users, highest role first then alphabetical. Never includes the hash. */
export function getUsers(db: DB): AdminUser[] {
  return db.all<AdminUser>(sql`
    SELECT id, username, email, role, points, created_at AS createdAt
    FROM users
    ORDER BY ${ROLE_ORDER}, username
  `);
}

/** A read-only handle: the live db OR an open transaction. countAdmins and
 * getUserRole only read, so the role-change route can pass its `tx` and run the
 * last-admin guard + the write atomically in one transaction. */
type Reader = Pick<DB, "all">;

/** How many admins exist — used to block demoting the last one. */
export function countAdmins(db: Reader): number {
  return db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`)[0].n;
}

/** A single user's current role, or null if no such user. */
export function getUserRole(db: Reader, id: number): string | null {
  return db.all<{ role: string }>(sql`SELECT role FROM users WHERE id = ${id}`)[0]?.role ?? null;
}

/** The three task-queue buckets in one read. */
export function getAdminQueue(db: DB): AdminQueue {
  const escalatedRuns = db.all<EscalatedRun>(sql`
    SELECT r.id AS runId, r.pokemon_dex AS pokemonDex, p.name AS pokemonName
    FROM runs r
    JOIN pokemon p ON p.dex = r.pokemon_dex
    WHERE r.record_state = 'escalated'
    ORDER BY r.id
  `);

  // Distinct contested facts (a fact = run + catalog item) across every run.
  const contestedFacts = db.all<ContestedFact>(sql`
    SELECT
      q.runId AS runId,
      (SELECT p.name FROM runs r JOIN pokemon p ON p.dex = r.pokemon_dex WHERE r.id = q.runId) AS pokemonName,
      q.label AS label,
      q.category AS category,
      MIN(q.timestampSec) AS timestampSec
    FROM (
      SELECT
        ${attributedRunId()} AS runId,
        ec.catalog_item_id AS catalogItemId,
        ci.label AS label,
        cat.slug AS category,
        ec.timestamp_sec AS timestampSec
      FROM event_claims ec
      JOIN video_logs vl ON vl.id = ec.log_id
      JOIN catalog_items ci ON ci.id = ec.catalog_item_id
      JOIN categories cat ON cat.id = ci.category_id
      LEFT JOIN claim_run cr ON cr.claim_id = ec.id
      WHERE ec.status = 'contested' AND vl.deleted_at IS NULL
    ) q
    WHERE q.runId IS NOT NULL
    GROUP BY q.runId, q.catalogItemId
    ORDER BY q.runId, q.label
  `);

  const pendingProposals = db.all<PendingProposal>(sql`
    SELECT
      pr.id AS id,
      pr.run_id AS runId,
      p.name AS pokemonName,
      ci.label AS label,
      u.username AS proposedBy,
      pr.note AS note,
      pr.timestamp_sec AS timestampSec,
      pr.created_at AS createdAt
    FROM proposals pr
    JOIN runs r ON r.id = pr.run_id
    JOIN pokemon p ON p.dex = r.pokemon_dex
    JOIN catalog_items ci ON ci.id = pr.catalog_item_id
    JOIN users u ON u.id = pr.proposed_by
    WHERE pr.status = 'pending'
    ORDER BY pr.created_at DESC
  `);

  return { escalatedRuns, contestedFacts, pendingProposals };
}
