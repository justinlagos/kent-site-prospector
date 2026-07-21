import { ComplianceError, normaliseName, randomToken } from "@ksp/shared";

/**
 * Non-deceptive slug policy: previews live at concept-{random}.netlify.app.
 * A slug may never contain recognisable tokens of the business's name, so a preview
 * URL cannot be mistaken for (or found as) the business's official site.
 */

export function generateConceptSlug(): string {
  return `concept-${randomToken()}`;
}

export function assertSlugNonDeceptive(slug: string, businessName: string): void {
  if (!/^concept-[a-z0-9]{8,16}$/.test(slug)) {
    throw new ComplianceError("SLUG_FORMAT", `Slug "${slug}" does not match concept-{random} policy`);
  }
  const tokens = normaliseName(businessName)
    .split(" ")
    .filter((t) => t.length >= 4);
  for (const token of tokens) {
    if (slug.includes(token)) {
      throw new ComplianceError(
        "SLUG_DECEPTIVE",
        `Slug "${slug}" contains business-name token "${token}"`,
      );
    }
  }
  if (/official|genuine|real/.test(slug)) {
    throw new ComplianceError("SLUG_DECEPTIVE", `Slug "${slug}" contains a deceptive word`);
  }
}
