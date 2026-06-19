/**
 * Canonical derivation (CORE) — the read side of "canonical is a VIEW over the
 * claims, not a second table." Given a run's claims, it groups them by a
 * TIMESTAMP-FREE assertion key and reports each fact's standing from the
 * lifecycle `status` the claims already carry. No authority/tiers: who made a
 * claim never weights it (that's a write-path permission question). No DB, no
 * Pokémon — ordinal categories arrive as config, like the validation layer's
 * owned-category set.
 *
 * Assertion identity (session 17):
 *   MEMBERSHIP  key=(item)            — "item occurred in this run." Set-valued;
 *               claim_fields ride along as values. Absence is NOT an assertion.
 *   ORDINAL     key=(category,pos)    — position derived from EACH log's OWN clock
 *               (never a cross-log timestamp merge), value = the item.
 *
 * A fact's status = the status its claims SHARE. The run is blank until the two
 * blind logs land (opening every fact as `agreed`), after which only
 * reviewers/admins act, flipping a fact's claims together. So a fact's claims are
 * uniform in status — we report that shared value directly, with no
 * ranking/precedence. Mixed statuses on one fact should never occur; if they do
 * it's a data-integrity anomaly, surfaced via `divergent` rather than guessed at.
 * Canonical = {agreed, certified}; queue = {contested}; {overturned} shown as
 * rejected; {draft, retracted} are filtered before grouping.
 */
export type ClaimStatus =
  | "draft"
  | "proposed"
  | "agreed"
  | "contested"
  | "overturned"
  | "certified"
  | "retracted";

// The statuses that survive filtering (draft/retracted are dropped upstream).
type ResolvedStatus = "proposed" | "agreed" | "contested" | "overturned" | "certified";

/** The coarse bucket a fact's status rolls into. */
export type Standing = "canonical" | "pending" | "contested" | "overturned";

const standingBucket = (s: ClaimStatus): Standing =>
  s === "certified" || s === "agreed"
    ? "canonical"
    : s === "contested"
      ? "contested"
      : s === "overturned"
        ? "overturned"
        : "pending";

export interface DeriveField {
  slug: string;
  label: string;
  value: string | null;
  valueCatalogItemId: number | null;
  valueLabel: string | null;
}

export interface DeriveClaim {
  id: number;
  logId: number;
  videoId: number;
  userId: number;
  status: ClaimStatus;
  catalogItemId: number;
  categorySlug: string;
  label: string;
  timestampSec: number;
  fields: DeriveField[];
}

export interface DeriveConfig {
  ordinalCategories: Set<string>; // category slugs whose facts are ordinal (e.g. {"gyms"})
}

export interface Supporter {
  claimId: number;
  logId: number;
  videoId: number; // which video this claim was logged against (drives the jump-to seek)
  userId: number;
  status: ClaimStatus;
  timestampSec: number;
}

export interface FieldValue {
  slug: string;
  label: string;
  value: string | null;
  valueCatalogItemId: number | null;
  valueLabel: string | null;
  logIds: number[];
}

export interface MembershipFact {
  catalogItemId: number;
  categorySlug: string;
  label: string;
  status: ClaimStatus; // the status the fact's claims share
  divergent: boolean; // true iff those claims disagree on status (a data-integrity anomaly)
  standing: Standing;
  support: number; // distinct logs backing it
  supporters: Supporter[];
  fields: FieldValue[];
}

export interface OrderFact {
  categorySlug: string;
  position: number; // 1-based, per each logger's own-clock ordering
  status: ClaimStatus;
  divergent: boolean;
  standing: Standing;
  support: number;
  candidates: { catalogItemId: number; label: string; logIds: number[] }[];
  fields: FieldValue[]; // collapsed field values (e.g. Brock's in-game time) — may diverge
  supporters: Supporter[];
}

export interface CanonicalVideo {
  id: number;
  youtubeId: string | null;
  title: string | null;
  durationSec: number | null;
}

export interface CanonicalRun {
  runId: number;
  recordState: string; // logging | reconciling | escalated | live
  videos: CanonicalVideo[]; // the run's source videos — embed + per-supporter seek target
  membership: MembershipFact[];
  order: OrderFact[];
  summary: { canonical: number; pending: number; contested: number; overturned: number; divergent: number };
}

// draft never surfaces publicly; retracted is struck. Everything else is visible.
const VISIBLE = new Set<ClaimStatus>(["proposed", "agreed", "contested", "overturned", "certified"]);

// A fact's status is simply the status its claims share. Callers pass only
// VISIBLE statuses (draft/retracted filtered), so the cast is sound. `divergent`
// flags the should-never-happen mixed case instead of silently picking a winner.
function factStatus(statuses: ClaimStatus[]): { status: ResolvedStatus; divergent: boolean } {
  const visible = statuses as ResolvedStatus[];
  return { status: visible[0], divergent: new Set(visible).size > 1 };
}

const toSupporter = (c: DeriveClaim): Supporter => ({
  claimId: c.id,
  logId: c.logId,
  videoId: c.videoId,
  userId: c.userId,
  status: c.status,
  timestampSec: c.timestampSec,
});

// Collapse field values across a fact's claims by (slug, value-identity). Two
// claims with the same value share a FieldValue (logIds merged); differing
// values yield separate entries for the SAME slug — that's a visible disagreement.
function collapseFields(group: DeriveClaim[]): FieldValue[] {
  const fieldMap = new Map<string, FieldValue>();
  for (const c of group) {
    for (const f of c.fields) {
      const key = `${f.slug}|${f.valueCatalogItemId != null ? `c:${f.valueCatalogItemId}` : `v:${f.value ?? ""}`}`;
      const fv = fieldMap.get(key) ?? {
        slug: f.slug,
        label: f.label,
        value: f.value,
        valueCatalogItemId: f.valueCatalogItemId,
        valueLabel: f.valueLabel,
        logIds: [],
      };
      if (!fv.logIds.includes(c.logId)) fv.logIds.push(c.logId);
      fieldMap.set(key, fv);
    }
  }
  return [...fieldMap.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function deriveMembership(claims: DeriveClaim[]): MembershipFact[] {
  const byItem = new Map<number, DeriveClaim[]>();
  for (const c of claims) (byItem.get(c.catalogItemId) ?? byItem.set(c.catalogItemId, []).get(c.catalogItemId)!).push(c);

  const facts: MembershipFact[] = [];
  for (const [catalogItemId, group] of byItem) {
    const { status, divergent } = factStatus(group.map((c) => c.status));
    facts.push({
      catalogItemId,
      categorySlug: group[0].categorySlug,
      label: group[0].label,
      status,
      divergent,
      standing: standingBucket(status),
      support: new Set(group.map((c) => c.logId)).size,
      supporters: group.map(toSupporter).sort((a, b) => a.timestampSec - b.timestampSec),
      fields: collapseFields(group),
    });
  }
  return facts.sort((a, b) => a.categorySlug.localeCompare(b.categorySlug) || a.label.localeCompare(b.label));
}

function deriveOrder(claims: DeriveClaim[]): OrderFact[] {
  // per (category, log): order the log's claims by ITS OWN clock → 1-based positions
  const byCatLog = new Map<string, Map<number, DeriveClaim[]>>();
  for (const c of claims) {
    const logs = byCatLog.get(c.categorySlug) ?? new Map<number, DeriveClaim[]>();
    (logs.get(c.logId) ?? logs.set(c.logId, []).get(c.logId)!).push(c);
    byCatLog.set(c.categorySlug, logs);
  }

  const byCatPos = new Map<string, Map<number, DeriveClaim[]>>();
  for (const [categorySlug, logs] of byCatLog) {
    const posMap = byCatPos.get(categorySlug) ?? new Map<number, DeriveClaim[]>();
    for (const [, logClaims] of logs) {
      [...logClaims]
        .sort((a, b) => a.timestampSec - b.timestampSec)
        .forEach((c, i) => (posMap.get(i + 1) ?? posMap.set(i + 1, []).get(i + 1)!).push(c));
    }
    byCatPos.set(categorySlug, posMap);
  }

  const facts: OrderFact[] = [];
  for (const [categorySlug, posMap] of byCatPos) {
    for (const [position, group] of posMap) {
      const { status, divergent } = factStatus(group.map((c) => c.status));
      const candMap = new Map<number, { catalogItemId: number; label: string; logIds: number[] }>();
      for (const c of group) {
        const cand = candMap.get(c.catalogItemId) ?? { catalogItemId: c.catalogItemId, label: c.label, logIds: [] };
        if (!cand.logIds.includes(c.logId)) cand.logIds.push(c.logId);
        candMap.set(c.catalogItemId, cand);
      }
      facts.push({
        categorySlug,
        position,
        status,
        divergent,
        standing: standingBucket(status),
        support: new Set(group.map((c) => c.logId)).size,
        candidates: [...candMap.values()],
        fields: collapseFields(group),
        supporters: group.map(toSupporter).sort((a, b) => a.timestampSec - b.timestampSec),
      });
    }
  }
  return facts.sort((a, b) => a.categorySlug.localeCompare(b.categorySlug) || a.position - b.position);
}

/** Derive the canonical view for one run from its claims (draft/retracted filtered here). */
export function deriveCanonical(
  runId: number,
  allClaims: DeriveClaim[],
  cfg: DeriveConfig,
  recordState = "logging",
  videos: CanonicalVideo[] = [],
): CanonicalRun {
  const claims = allClaims.filter((c) => VISIBLE.has(c.status));
  const membership = deriveMembership(claims.filter((c) => !cfg.ordinalCategories.has(c.categorySlug)));
  const order = deriveOrder(claims.filter((c) => cfg.ordinalCategories.has(c.categorySlug)));

  const summary = { canonical: 0, pending: 0, contested: 0, overturned: 0, divergent: 0 };
  for (const f of [...membership, ...order]) {
    summary[f.standing]++;
    if (f.divergent) summary.divergent++;
  }

  return { runId, recordState, videos, membership, order, summary };
}
