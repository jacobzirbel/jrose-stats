/**
 * Pure derivation tests (no DB, so they run regardless of migration state) for
 * the identity-field grain + the `confirmed` value flag (session 20):
 *   - an identity field (copied-move) splits one item into per-value facts, so
 *     Mimic copying two moves in one run is two agreed facts, not a conflict.
 *   - a value field set by only one logger rides as `confirmed: false` (M2).
 */
import { test, expect } from "bun:test";

import { deriveCanonical, type DeriveClaim } from "../src/canonical/derive";

const MIMIC = 5;

function mimicClaim(id: number, logId: number, copiedId: number, copiedLabel: string): DeriveClaim {
  return {
    id,
    logId,
    videoId: 1,
    userId: logId,
    status: "agreed",
    catalogItemId: MIMIC,
    categorySlug: "moves",
    label: "Mimic",
    timestampSec: id,
    fields: [
      {
        slug: "copied-move",
        label: "Mimicked move",
        value: null,
        valueCatalogItemId: copiedId,
        valueLabel: copiedLabel,
        isIdentity: true,
      },
    ],
  };
}

test("an identity field splits one item into a fact per value (Mimic → Tackle / Growl)", () => {
  // Two blind logs both tag Mimic copying Tackle AND Growl.
  const claims = [
    mimicClaim(1, 10, 100, "Tackle"),
    mimicClaim(2, 10, 101, "Growl"),
    mimicClaim(3, 11, 100, "Tackle"),
    mimicClaim(4, 11, 101, "Growl"),
  ];
  const run = deriveCanonical(1, claims, { ordinalCategories: new Set() });

  expect(run.membership.length).toBe(2); // NOT one collapsed (run, Mimic) fact
  expect(run.membership.map((f) => f.label).sort()).toEqual(["Mimic → Growl", "Mimic → Tackle"]);
  for (const f of run.membership) {
    expect(f.support).toBe(2); // each copied move corroborated by both logs → agreed
    expect(f.fields.find((x) => x.slug === "copied-move")?.confirmed).toBe(true);
  }
});

test("a value field set by only one logger is confirmed:false (M2)", () => {
  const eventClaim = (id: number, logId: number, why?: string): DeriveClaim => ({
    id,
    logId,
    videoId: 1,
    userId: logId,
    status: "agreed",
    catalogItemId: 7,
    categorySlug: "events",
    label: "Restarts the run",
    timestampSec: id,
    fields:
      why != null
        ? [{ slug: "why", label: "Why", value: why, valueCatalogItemId: null, valueLabel: null, isIdentity: false }]
        : [],
  });

  // Same item, no identity field → one membership fact; only log 10 set `why`.
  const run = deriveCanonical(1, [eventClaim(1, 10, "glitch"), eventClaim(2, 11)], {
    ordinalCategories: new Set(),
  });

  expect(run.membership.length).toBe(1);
  expect(run.membership[0].support).toBe(2);
  expect(run.membership[0].fields.find((x) => x.slug === "why")?.confirmed).toBe(false);
});
