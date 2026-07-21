import { describe, expect, it } from "vitest";
import { validateClaims } from "./claims-validator.js";
import { INDUSTRY_STRATEGIES, getStrategy } from "./strategies.js";
import type { ResearchBrief } from "@ksp/research";

function briefWithFacts(facts: Array<{ fact: string; source: string }>): ResearchBrief {
  return {
    businessName: "Test Dental Ltd",
    businessSummary: "s",
    targetCustomer: "t",
    primaryServices: ["Dentistry"],
    apparentDifferentiators: [],
    locationServed: "Maidstone",
    existingBrandColours: [],
    typographyStyle: "sans",
    toneOfVoice: "warm",
    keyCallsToAction: ["Book"],
    trustIndicators: [],
    openingHours: null,
    contact: { phone: null, email: null, address: "1 High St", town: "Maidstone" },
    reviewThemes: [],
    commonCustomerQuestions: [],
    conversionOpportunities: ["x"],
    contentGaps: [],
    designWeaknesses: [],
    recommendedStructure: ["hero", "services", "cta", "contact"],
    verifiedFacts: facts,
    designRecommendations: [],
    unknowns: [],
    placeholders: [],
  };
}

describe("claims firewall", () => {
  it("blocks invented awards, years, prices, guarantees, accreditations", () => {
    const brief = briefWithFacts([]);
    const text =
      "We are an award-winning practice with 25 years of experience. Checks from £49. " +
      "Satisfaction guaranteed. Gas Safe registered. Established in 1998.";
    const rules = validateClaims(text, brief).map((v) => v.rule);
    expect(rules).toContain("award-claim");
    expect(rules).toContain("years-in-business");
    expect(rules).toContain("price-claim");
    expect(rules).toContain("guarantee");
    expect(rules).toContain("accreditation");
    expect(rules).toContain("established-year");
  });

  it("allows claims present in verified facts", () => {
    const brief = briefWithFacts([
      { fact: "132 public reviews averaging 4.4/5", source: "google" },
    ]);
    const violations = validateClaims("Rated 4.4/5 by customers.", brief);
    expect(violations.filter((v) => v.rule === "review-score")).toHaveLength(0);
  });

  it("blocks review scores NOT in verified facts", () => {
    const brief = briefWithFacts([]);
    const violations = validateClaims("Rated 5/5 by hundreds of happy patients.", brief);
    expect(violations.map((v) => v.rule)).toContain("review-score");
  });

  it("always blocks health-outcome claims and false urgency", () => {
    const brief = briefWithFacts([{ fact: "cures back pain", source: "x" }]); // even 'verified' cannot allow
    const violations = validateClaims("Our treatment cures back pain. Act now — limited time!", brief);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain("health-outcome");
    expect(rules).toContain("urgency-pressure");
  });

  it("catches unresolved template variables", () => {
    const violations = validateClaims("Welcome to [BUSINESS NAME] in {{town}}", briefWithFacts([]));
    expect(violations.map((v) => v.rule)).toContain("unresolved-template-var");
  });
});

describe("industry strategies", () => {
  it("ships at least 15 sector strategies, each complete", () => {
    const keys = Object.keys(INDUSTRY_STRATEGIES);
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const key of keys) {
      const s = INDUSTRY_STRATEGIES[key]!;
      expect(s.primaryCta.length).toBeGreaterThan(3);
      expect(s.sections).toContain("hero");
      expect(s.sections).toContain("contact");
      expect(s.palette.primary).toMatch(/^#/);
    }
  });

  it("falls back safely for unknown strategy keys", () => {
    expect(getStrategy("nonexistent").key).toBe("professional-services");
  });
});
