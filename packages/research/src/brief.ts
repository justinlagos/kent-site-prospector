import { z } from "zod";

/**
 * The ResearchBrief is the ONLY source of business information the landing-page and
 * email generators are permitted to see. Its four provenance sections are disjoint:
 * anything not in `verifiedFacts` may not be asserted as fact downstream.
 */

export const verifiedFactSchema = z.object({
  fact: z.string(),
  source: z.string(), // URL or "google-places" | "companies-house" | "website-audit"
});

export const researchBriefSchema = z.object({
  businessName: z.string(),
  businessSummary: z.string(),
  targetCustomer: z.string(),
  primaryServices: z.array(z.string()).max(8),
  apparentDifferentiators: z.array(z.string()).max(5),
  locationServed: z.string(),
  existingBrandColours: z.array(z.string()).max(4),
  typographyStyle: z.string(),
  toneOfVoice: z.string(),
  keyCallsToAction: z.array(z.string()).min(1).max(4),
  trustIndicators: z.array(z.string()),
  openingHours: z.record(z.string()).nullable(),
  contact: z.object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string(),
    town: z.string(),
  }),
  reviewThemes: z.array(z.string()),
  commonCustomerQuestions: z.array(z.string()).max(8),
  conversionOpportunities: z.array(z.string()).min(1),
  contentGaps: z.array(z.string()),
  designWeaknesses: z.array(z.string()),
  recommendedStructure: z.array(z.string()).min(4),

  // Provenance separation — the compliance-critical part.
  verifiedFacts: z.array(verifiedFactSchema),
  designRecommendations: z.array(z.string()),
  unknowns: z.array(z.string()),
  placeholders: z.array(z.string()),
});

export type ResearchBrief = z.infer<typeof researchBriefSchema>;

export interface BriefSourceData {
  business: {
    id: string;
    name: string;
    town: string;
    address: string;
    postcode: string;
    phone: string | null;
    primaryEmail: string | null;
    website: string | null;
    reviewCount: number | null;
    reviewRating: number | null;
    openingHours: Record<string, string> | null;
    categoryLabel: string;
    strategyKey: string;
    sourceUrl: string | null;
  };
  auditFindings: Record<string, unknown>;
  auditScores: Record<string, number>;
}

/** Facts derivable without any LLM — always present and always sourced. */
export function baselineVerifiedFacts(src: BriefSourceData): Array<z.infer<typeof verifiedFactSchema>> {
  const b = src.business;
  const facts: Array<z.infer<typeof verifiedFactSchema>> = [
    { fact: `Business name: ${b.name}`, source: b.sourceUrl ?? "business-directory" },
    { fact: `Located at ${b.address}, ${b.postcode}`, source: b.sourceUrl ?? "business-directory" },
    { fact: `Category: ${b.categoryLabel}`, source: b.sourceUrl ?? "business-directory" },
  ];
  if (b.phone) facts.push({ fact: `Phone: ${b.phone}`, source: b.sourceUrl ?? "business-directory" });
  if (b.primaryEmail) facts.push({ fact: `Email: ${b.primaryEmail}`, source: b.sourceUrl ?? "business-directory" });
  if (b.reviewCount !== null && b.reviewRating !== null && b.reviewCount > 0) {
    facts.push({
      fact: `${b.reviewCount} public reviews averaging ${b.reviewRating.toFixed(1)}/5`,
      source: b.sourceUrl ?? "business-directory",
    });
  }
  if (b.openingHours) {
    facts.push({ fact: `Opening hours published: ${JSON.stringify(b.openingHours)}`, source: b.sourceUrl ?? "business-directory" });
  }
  if (b.website) facts.push({ fact: `Existing website: ${b.website}`, source: "website-audit" });
  return facts;
}
