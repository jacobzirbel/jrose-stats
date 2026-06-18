/**
 * Generic validators (CORE). Domain-agnostic — they read only the neutral
 * `ValidationContext`, never a domain table. Imports nothing from ../db/schema
 * beyond what the context already carries.
 */
import type { ClaimValidator, ContextClaimField, ValidationContext, Violation } from "./types";

/** `0 ≤ timestamp_sec ≤ video.duration_sec` (a CHECK can't reach another table). */
export class TimestampBounds implements ClaimValidator {
  validate(ctx: ValidationContext): Violation[] {
    const dur = ctx.video.durationSec;
    const out: Violation[] = [];
    for (const c of ctx.claims) {
      if (c.timestampSec < 0 || (dur != null && c.timestampSec > dur)) {
        out.push({
          code: "timestamp-out-of-bounds",
          message: `"${c.catalogItemLabel}" at ${c.timestampSec.toFixed(0)}s is outside the video (0–${dur?.toFixed(0) ?? "?"}s).`,
          claimId: c.id,
        });
      }
    }
    return out;
  }
}

/** No claim may point at a retired catalog item (status is a core column). */
export class CatalogItemActive implements ClaimValidator {
  validate(ctx: ValidationContext): Violation[] {
    return ctx.claims
      .filter((c) => c.catalogItemStatus === "retired")
      .map((c) => ({
        code: "catalog-item-retired",
        message: `"${c.catalogItemLabel}" has been retired and can't be used.`,
        claimId: c.id,
      }));
  }
}

/**
 * Per-claim metadata integrity (core). For every claim, the fields configured
 * for its scope (category-wide OR item-specific) must be well-formed:
 *   - a `required` field must have a value;
 *   - a `catalog_ref` field stores a reference (value_catalog_item_id), nothing else;
 *   - any other type stores a scalar `value`, never a reference.
 * Backs the schema's "exactly one of value / value_catalog_item_id" promise that
 * a CHECK can't express (the rule depends on category_fields.type).
 */
export class ClaimFieldsValidator implements ClaimValidator {
  validate(ctx: ValidationContext): Violation[] {
    const out: Violation[] = [];
    const valuesByClaim = new Map<number, ContextClaimField[]>();
    for (const v of ctx.claimFields) {
      (valuesByClaim.get(v.claimId) ?? valuesByClaim.set(v.claimId, []).get(v.claimId)!).push(v);
    }

    for (const claim of ctx.claims) {
      const applicable = ctx.categoryFields.filter(
        (f) =>
          f.categoryId === claim.categoryId &&
          (f.catalogItemId == null || f.catalogItemId === claim.catalogItemId),
      );
      const applicableIds = new Set(applicable.map((f) => f.id));
      const values = valuesByClaim.get(claim.id) ?? [];
      const byField = new Map(values.map((v) => [v.fieldId, v]));

      for (const f of applicable) {
        const v = byField.get(f.id);
        const hasScalar = v != null && v.value != null && v.value !== "";
        const hasRef = v != null && v.valueCatalogItemId != null;
        if (!v || (!hasScalar && !hasRef)) {
          if (f.required) {
            out.push({
              code: "claim-field-missing",
              message: `"${claim.catalogItemLabel}" needs a ${f.label}.`,
              claimId: claim.id,
            });
          }
          continue;
        }
        // catalog_ref must hold only the reference; every other type only a scalar.
        const malformed =
          f.type === "catalog_ref" ? !hasRef || hasScalar : !hasScalar || hasRef;
        if (malformed) {
          out.push({
            code: "claim-field-malformed",
            message: `${f.label} on "${claim.catalogItemLabel}" is malformed for a ${f.type} field.`,
            claimId: claim.id,
          });
        }
      }

      for (const v of values) {
        if (!applicableIds.has(v.fieldId)) {
          out.push({
            code: "claim-field-stray",
            message: `A stored field on "${claim.catalogItemLabel}" doesn't apply to it.`,
            claimId: claim.id,
          });
        }
      }
    }
    return out;
  }
}

/**
 * Every `required=1` category that NO domain validator owns must hold ≥1 claim.
 * Owned categories (e.g. Gyms) are deferred entirely to their domain validator.
 */
export class RequiredCategoriesPresent implements ClaimValidator {
  constructor(private readonly ownedSlugs: ReadonlySet<string>) {}

  validate(ctx: ValidationContext): Violation[] {
    const present = new Set(ctx.claims.map((c) => c.categorySlug));
    return ctx.categories
      .filter((cat) => cat.required && !this.ownedSlugs.has(cat.slug) && !present.has(cat.slug))
      .map((cat) => ({
        code: "required-category-missing",
        message: `No ${cat.label} logged — this category is required.`,
      }));
  }
}
