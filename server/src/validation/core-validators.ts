/**
 * Generic validators (CORE). Domain-agnostic — they read only the neutral
 * `ValidationContext`, never a domain table. Imports nothing from ../db/schema
 * beyond what the context already carries.
 */
import type { ClaimValidator, ValidationContext, Violation } from "./types";

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
