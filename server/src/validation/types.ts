/**
 * Validation seam (CORE). Defines the neutral facts a validator sees and the
 * `ClaimValidator` interface. Core ships only generic validators; the domain
 * implements its own (learnset, gym completeness) and they're registered at the
 * composition root (`./index.ts`). This file imports nothing domain-specific.
 *
 * Refinement of the schema.md `validate(claim, log, video)` sketch: validators
 * receive the WHOLE log context (all claims), because completeness/required
 * checks are per-log, not per-claim. Domain validators additionally hold their
 * own DB handle and do their own run/learnset/gym lookups (schema.md contract).
 */
export interface Violation {
  code: string;
  message: string;
  claimId?: number | null;
}

/** One claim, enriched with the core facts a validator needs (no domain data). */
export interface ContextClaim {
  id: number;
  catalogItemId: number;
  categoryId: number;
  categorySlug: string;
  catalogItemLabel: string;
  catalogItemStatus: string;
  timestampSec: number;
}

/** A configured per-claim metadata field (core's category_fields). */
export interface ContextCategoryField {
  id: number;
  categoryId: number;
  catalogItemId: number | null; // null = whole category; set = item-scoped
  slug: string;
  label: string;
  type: string; // 'text'|'number'|'duration'|'enum'|'catalog_ref'
  required: boolean;
}

/** A stored value for one (claim, field) — exactly one column is populated. */
export interface ContextClaimField {
  claimId: number;
  fieldId: number;
  value: string | null;
  valueCatalogItemId: number | null;
}

export interface ValidationContext {
  log: { id: number };
  video: { id: number; durationSec: number | null };
  claims: ContextClaim[];
  categories: { id: number; slug: string; label: string; required: boolean }[];
  categoryFields: ContextCategoryField[];
  claimFields: ContextClaimField[];
}

export interface ClaimValidator {
  validate(ctx: ValidationContext): Violation[];
}
